/**
 * Section tree: from the PDF outline (hyperref bookmarks) when present,
 * otherwise from heading-looking lines (numbering, known titles, font).
 */
import { cleanQuote } from '../text/text-index.js';
import {
	before,
	finiteTargetY,
	headingKey,
	KNOWN_HEADINGS,
	NUMBERED_HEADING,
	REFERENCES_HEADING,
	type DocContext
} from './context.js';
import { lineRect, type Line } from './lines.js';
import type { OutlineNodeLike, Section } from './types.js';

interface FlatSection extends Omit<Section, 'children' | 'endPage' | 'endY'> {
	/** Reading-order key within the page (raw offset of the heading line). */
	order: number;
}

export async function extractSections(
	ctx: DocContext,
	outline: OutlineNodeLike[] | null
): Promise<Section[]> {
	let flat: FlatSection[] = [];
	if (outline?.length) flat = await fromOutline(ctx, outline);
	if (flat.length < 2) flat = fromText(ctx);
	addSynthetic(ctx, flat);
	flat.sort((a, b) => a.page - b.page || a.order - b.order);
	return buildTree(ctx, flat);
}

async function fromOutline(ctx: DocContext, outline: OutlineNodeLike[]): Promise<FlatSection[]> {
	const out: FlatSection[] = [];
	const walk = async (nodes: OutlineNodeLike[], level: number) => {
		for (const node of nodes) {
			const target = node.dest ? await ctx.resolve(node.dest) : null;
			if (target) {
				const page = target.page;
				const y = finiteTargetY(target) ?? ctx.src.pageSize(page).height;
				const raw = cleanTitle(node.title);
				let number = /^((?:\d+|[A-Z])(?:\.\d+)*)\.?\s+/.exec(raw)?.[1];
				let title = number ? raw.slice(raw.indexOf(' ') + 1).trim() : raw;
				// Find the heading line at the destination to recover number and box.
				const line = findHeadingLine(ctx.lines[page - 1] ?? [], y, title);
				if (line && !number) {
					const m = /^((?:\d+|[A-Z])(?:\.\d+)*)\.?\s+/.exec(line.text.trim());
					if (m && headingKey(line.text).includes(headingKey(title).slice(0, 12))) number = m[1];
				}
				// Titles polluted by macro garbage: prefer the visible line.
				if (line && /\d{4}\/\d\d\/\d\d|bold0mu|ver:|\b[a-z]+:[a-z]+\b/.test(title))
					title = line.text.trim().replace(/^((?:\d+|[A-Z])(?:\.\d+)*)\.?\s+/, '');
				out.push({
					id: `sec-${out.length + 1}`,
					number,
					title,
					level,
					page,
					y: line ? line.top : y,
					rect: line ? lineRect(line) : undefined,
					kind: kindOf(title, typeof node.dest === 'string' ? node.dest : undefined),
					dest: typeof node.dest === 'string' ? node.dest : undefined,
					source: 'outline',
					order: line ? line.start : orderFromY(ctx, page, y)
				});
			}
			if (node.items?.length) await walk(node.items, level + 1);
		}
	};
	await walk(outline, 1);
	return out;
}

function fromText(ctx: DocContext): FlatSection[] {
	const out: FlatSection[] = [];
	const counts = new Map<string, number>();
	for (const lines of ctx.lines)
		for (const l of lines) counts.set(l.text.trim(), (counts.get(l.text.trim()) ?? 0) + 1);
	// The paper title (largest font on page 1) is not a section.
	const p1 = ctx.lines[0] ?? [];
	const titleSize = Math.max(0, ...p1.filter((l) => !l.rotated).map((l) => l.size));
	for (const lines of ctx.lines) {
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i];
			const text = l.text.trim();
			if (l.rotated || text.length < 3 || text.length > 90) continue;
			if (l.page === 1 && Math.abs(l.size - titleSize) < 0.5 && titleSize > ctx.body * 1.15)
				continue;
			// Running headers/footers repeat on many pages.
			if ((counts.get(text) ?? 0) > 2) continue;
			if (/^(figure|fig\.|table|algorithm)\s*\d/i.test(text)) continue;
			const emphasised =
				l.size >= ctx.body + 0.4 || (l.font !== ctx.bodyFont && l.size >= ctx.body - 0.6);
			if (!emphasised) continue;
			const known = KNOWN_HEADINGS.test(
				text.replace(/^((?:\d+|[A-Z]|[IVX]+)(?:\.\d+)*)\.?\s+/, '').replace(/[.:]$/, '')
			);
			const m = NUMBERED_HEADING.exec(text);
			if (!m && !known) continue;
			if (m && /[.,;:]$/.test(text) && !known) continue;
			// Numbered lines must look like titles, not table rows or equations.
			if (m && !known && !/^\p{Lu}[\p{L}-]{2,}/u.test(m[2])) continue;
			if (m && !known && /\d\s+\d/.test(m[2])) continue;
			const number = m?.[1] ?? /^((?:\d+|[A-Z])(?:\.\d+)*)\.?\s+/.exec(text)?.[1];
			const title = cleanTitle(
				m ? m[2] : text.replace(/^((?:\d+|[A-Z]|[IVX]+)(?:\.\d+)*)\.?\s+/, '')
			);
			const level = number ? number.split('.').length : 1;
			out.push({
				id: `sec-${out.length + 1}`,
				number,
				title,
				level,
				page: l.page,
				y: l.top,
				rect: lineRect(l),
				kind: kindOf(title),
				source: 'text',
				order: l.start
			});
		}
	}
	// Sanity: numbered top-level sections should increase; drop numbered outliers that go backwards.
	let lastTop = 0;
	return out.filter((s) => {
		if (!s.number || s.level !== 1 || !/^\d+$/.test(s.number)) return true;
		const n = Number(s.number);
		if (n < lastTop) return false;
		lastTop = n;
		return true;
	});
}

/** Add Abstract / References entries the outline usually lacks. */
function addSynthetic(ctx: DocContext, flat: FlatSection[]) {
	const has = (kind: string) => flat.some((s) => s.kind === kind);
	if (!has('abstract')) {
		for (let p = 0; p < Math.min(2, ctx.lines.length); p++) {
			const l = ctx.lines[p].find(
				(x) => /^\s*abstract\b/i.test(x.text) && x.text.trim().length < 400
			);
			if (l) {
				flat.push({
					id: 'sec-abstract',
					title: 'Abstract',
					level: 1,
					page: l.page,
					y: l.top,
					rect: lineRect(l),
					kind: 'abstract',
					source: 'text',
					order: l.start
				});
				break;
			}
		}
	}
	if (!has('references')) {
		const l = findReferencesHeading(ctx);
		if (l)
			flat.push({
				id: 'sec-references',
				title: l.text.trim().replace(/^(?:\d+|[A-Z])\.?\s+/, ''),
				level: 1,
				page: l.page,
				y: l.top,
				rect: lineRect(l),
				kind: 'references',
				source: 'text',
				order: l.start
			});
	}
	// Stable ids in reading order.
	flat.sort((a, b) => a.page - b.page || a.order - b.order);
	flat.forEach((s, i) => (s.id = `sec-${i + 1}`));
}

/** The last "References"/"Bibliography" heading line in the document. */
export function findReferencesHeading(ctx: DocContext): Line | null {
	for (let p = ctx.lines.length - 1; p >= 0; p--) {
		const lines = ctx.lines[p];
		for (let i = lines.length - 1; i >= 0; i--) {
			const l = lines[i];
			if (!l.rotated && REFERENCES_HEADING.test(l.text.trim())) return l;
		}
	}
	return null;
}

function buildTree(ctx: DocContext, flat: FlatSection[]): Section[] {
	const sections: Section[] = flat.map(({ order: _o, ...s }) => ({
		...s,
		endPage: ctx.numPages,
		endY: 0,
		children: []
	}));
	// End = start of the next section at the same or a higher level.
	for (let i = 0; i < sections.length; i++) {
		const s = sections[i];
		const next = sections.slice(i + 1).find((n) => n.level <= s.level);
		if (next) {
			s.endPage = next.page;
			s.endY = next.y;
		}
	}
	const roots: Section[] = [];
	const stack: Section[] = [];
	for (const s of sections) {
		while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
		if (stack.length) stack[stack.length - 1].children.push(s);
		else roots.push(s);
		stack.push(s);
	}
	return roots;
}

/** Depth-first list of a section tree. */
export function flattenSections(sections: Section[]): Section[] {
	const out: Section[] = [];
	const walk = (list: Section[]) => {
		for (const s of list) {
			out.push(s);
			walk(s.children);
		}
	};
	walk(sections);
	return out;
}

/** The deepest section containing (page, y). */
export function sectionAt(sections: Section[], page: number, y: number): Section | null {
	let found: Section | null = null;
	for (const s of flattenSections(sections)) {
		const started = !before(page, y, s.page, s.y + 1);
		const ended = s.endY === 0 ? page > s.endPage : !before(page, y, s.endPage, s.endY);
		if (started && !ended && (!found || s.level >= found.level)) found = s;
	}
	return found;
}

function findHeadingLine(lines: Line[], y: number, title: string): Line | null {
	const key = headingKey(title).slice(0, 16);
	let best: Line | null = null;
	let bestD = Infinity;
	for (const l of lines) {
		if (l.rotated) continue;
		const d = Math.abs(l.top - y);
		if (d > 40) continue;
		const matches = key && headingKey(l.text).includes(key);
		const score = d + (matches ? 0 : 30);
		if (score < bestD) {
			bestD = score;
			best = l;
		}
	}
	return best && bestD < 30 ? best : null;
}

function cleanTitle(s: string) {
	return cleanQuote(s).replace(/\s+/g, ' ').trim();
}

function kindOf(title: string, dest?: string): FlatSection['kind'] {
	if (/^abstract$/i.test(title)) return 'abstract';
	if (REFERENCES_HEADING.test(title)) return 'references';
	if (dest?.startsWith('appendix') || /^appendi(x|ces)\b/i.test(title)) return 'appendix';
	return 'section';
}

/** Approximate reading-order key for a y position: offset of the first line at or below it. */
function orderFromY(ctx: DocContext, page: number, y: number): number {
	const lines = ctx.lines[page - 1] ?? [];
	const l = lines.find((x) => x.top <= y + 2);
	return l ? l.start : 0;
}
