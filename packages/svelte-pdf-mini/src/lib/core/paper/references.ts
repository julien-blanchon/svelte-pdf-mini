/**
 * Bibliography: locate it, split it into entries, parse each entry.
 *
 * Entry starts come from (best first): `[key]` prefixes, `1.` numbering, the
 * positions of `cite.*` destinations (hyperref points at each entry), or a
 * hanging-indent / spacing layout analysis.
 */
import { cleanQuote, quadsBounds } from '../text/text-index.js';
import { distanceToRange } from '../view/geometry.js';
import { before, finiteTargetY, targetY, type DocContext } from './context.js';
import { lineRect, unionRect, type Line } from './lines.js';
import { findReferencesHeading, flattenSections } from './sections.js';
import type { ParsedReference, Reference, ResolvedTarget, Section } from './types.js';

export interface BibliographyRegion {
	/** Start (inclusive) and end (exclusive) positions as (page, y). */
	startPage: number;
	startY: number;
	/** Top of the heading (link targets may point slightly above the first entry). */
	startTop: number;
	endPage: number;
	endY: number;
	lines: Line[];
}

/** Does a link target land inside the bibliography? */
export function inBibliographyRegion(t: ResolvedTarget, region: BibliographyRegion): boolean {
	const y = targetY(t);
	return (
		!before(t.page, y, region.startPage, region.startTop) &&
		before(t.page, y, region.endPage, region.endY)
	);
}

export interface ReferencesResult {
	references: Reference[];
	region: BibliographyRegion | null;
	style: 'numeric' | 'alpha' | 'author-year' | 'unknown';
	/** cite.* destination name → resolved target. */
	citeTargets: Map<string, ResolvedTarget>;
}

export async function extractReferences(
	ctx: DocContext,
	sections: Section[]
): Promise<ReferencesResult> {
	// Resolve every cite.* destination used by links (cached by the source).
	const citeTargets = new Map<string, ResolvedTarget>();
	for (const links of ctx.links)
		for (const link of links)
			if (
				typeof link.dest === 'string' &&
				link.dest.startsWith('cite.') &&
				!citeTargets.has(link.dest)
			) {
				const t = await ctx.resolve(link.dest);
				if (t) citeTargets.set(link.dest, t);
			}

	const region = findRegion(ctx, sections, citeTargets);
	if (!region || !region.lines.length)
		return { references: [], region, style: 'unknown', citeTargets };

	const starts = entryStarts(ctx, region, citeTargets);
	const references: Reference[] = [];
	const lines = region.lines;
	for (let k = 0; k < starts.length; k++) {
		const from = starts[k];
		const to = k + 1 < starts.length ? starts[k + 1] : lines.length;
		const entryLines = lines.slice(from, to).filter((l) => !isPageNumber(l));
		if (!entryLines.length) continue;
		const raw = cleanQuote(entryLines.map((l) => l.text).join('\n'));
		if (raw.length < 8) continue;
		const firstPage = entryLines[0].page;
		const onFirst = entryLines.filter((l) => l.page === firstPage);
		const ranges: Reference['ranges'] = [];
		for (const l of entryLines) {
			const last = ranges[ranges.length - 1];
			if (last && last.page === l.page) last.end = l.end;
			else ranges.push({ page: l.page, start: l.start, end: l.end });
		}
		const text = ctx.texts[firstPage - 1];
		const quads = text.quadsFor(ranges[0].start, ranges[0].end);
		const keyMatch = /^\s*\[([^\]]{1,30})\]/.exec(raw) ?? /^\s*(\d{1,3})\.\s/.exec(raw);
		// Superscripts in alpha keys come out as "ADG+ 16": keys never contain spaces.
		const key = keyMatch?.[1].replace(/\s+/g, '');
		const parsed = parseReference(raw);
		references.push({
			id: `ref-${references.length + 1}`,
			index: references.length + 1,
			key,
			label: '',
			raw,
			page: firstPage,
			rect: quadsBounds(quads) ?? unionRect(onFirst.map(lineRect))!,
			quads,
			ranges,
			dests: [],
			parsed
		});
	}

	// Trailing non-entries (an appendix intro caught by layout splitting).
	while (references.length > 3) {
		const last = references[references.length - 1];
		if (last.key || last.parsed.year || last.parsed.authors.length) break;
		references.pop();
	}

	// Attach cite.* names to the entry containing their target.
	for (const [name, t] of citeTargets) {
		const ref = refAtTarget(references, t);
		if (ref) ref.dests.push(name);
	}

	const style = citationStyle(references);
	for (const r of references) r.label = labelOf(r, style);
	return { references, region, style, citeTargets };
}

/** Mostly keyed entries ("[12]", "[Smi20]") → numeric / alpha; mostly surname + year → author-year. */
function citationStyle(references: Reference[]): ReferencesResult['style'] {
	const majority = references.length * 0.6;
	const keyed = references.filter((r) => r.key).length;
	if (keyed > majority) {
		const numericKeys = references.filter((r) => r.key && /^\d+$/.test(r.key)).length;
		return numericKeys > keyed * 0.8 ? 'numeric' : 'alpha';
	}
	const authorYear = references.filter((r) => r.parsed.year && r.parsed.surnames.length).length;
	return authorYear > majority ? 'author-year' : 'unknown';
}

/** Vertical distance from `y` to [y1, y2], ignoring misses of up to 2pt. */
function verticalMiss(y: number, y1: number, y2: number): number {
	if (y > y2 + 2) return y - y2;
	if (y < y1 - 2) return y1 - y;
	return 0;
}

/** The reference entry whose lines contain a target point (or the closest start below it). */
export function refAtTarget(references: Reference[], t: ResolvedTarget): Reference | null {
	const y = finiteTargetY(t) ?? NaN;
	// hyperref often leaves the XYZ left empty (resolved as 0): treat as unknown.
	const px = t.point?.[0];
	const hasX = px !== undefined && Number.isFinite(px) && px > 0;
	const x = hasX ? px : (t.rect?.[0] ?? NaN);
	let best: Reference | null = null;
	let bestD = Infinity;
	for (const r of references) {
		if (r.page !== t.page) continue;
		const [x1, y1, x2, y2] = r.rect;
		const dy = verticalMiss(y, y1, y2);
		// Targets often sit at the margin left of hanging-indented entries: only penalise far misses.
		const dx = Number.isNaN(x) ? 0 : distanceToRange(x, x1 - 60, x2);
		// hyperref's XYZ point sits slightly above the entry's first line.
		const d = dy + dx * 2 + (y >= y2 ? 0 : 1);
		if (d < bestD) {
			bestD = d;
			best = r;
		}
	}
	return best && bestD < 30 ? best : null;
}

function findRegion(
	ctx: DocContext,
	sections: Section[],
	citeTargets: Map<string, ResolvedTarget>
): BibliographyRegion | null {
	const heading = findReferencesHeading(ctx);
	let startPage: number;
	let startY: number;
	let startTop: number;
	if (heading) {
		startPage = heading.page;
		startY = heading.bottom;
		// Targets of the first entries can sit up to a line above the heading.
		startTop = heading.top + (heading.top - heading.bottom) + 4;
	} else if (citeTargets.size) {
		// No heading: start just above the first cite target.
		const first = [...citeTargets.values()].sort(
			(a, b) => a.page - b.page || (b.point?.[1] ?? 0) - (a.point?.[1] ?? 0)
		)[0];
		startPage = first.page;
		startY = (first.point?.[1] ?? ctx.src.pageSize(first.page).height) + 2;
		startTop = startY + 2;
	} else return null;

	// End at the first section heading after the bibliography (e.g. an appendix).
	let endPage = ctx.numPages + 1;
	let endY = Infinity;
	let endSection: Section | null = null;
	for (const s of flattenSections(sections)) {
		if (s.kind === 'references') continue;
		if (before(startPage, startY, s.page, s.y) && before(s.page, s.y, endPage, endY)) {
			endPage = s.page;
			endY = s.y;
			endSection = s;
		}
	}
	// If a cite target lies after that heading, the heading was a false positive.
	for (const t of citeTargets.values()) {
		const ty = t.point?.[1] ?? 0;
		if (Number.isFinite(ty) && before(endPage, endY, t.page, ty)) {
			endPage = ctx.numPages + 1;
			endY = Infinity;
			endSection = null;
			break;
		}
	}
	// Bound by reading order (raw offsets), which is right for two-column pages
	// where y alone cannot tell the columns apart.
	const startOffset = heading ? heading.end : -1;
	const endLine = endSection ? headingLineOf(ctx, endSection) : null;
	const lines: Line[] = [];
	for (let p = startPage; p <= Math.min(endPage, ctx.numPages); p++) {
		for (const l of ctx.lines[p - 1]) {
			if (l.rotated) continue;
			if (p === startPage && (heading ? l.start < startOffset : l.top > startY + 0.5)) continue;
			if (p === endPage && (endLine ? l.start >= endLine.start : l.top >= endY - 0.5)) continue;
			if (heading && l === heading) continue;
			lines.push(l);
		}
	}
	return { startPage, startY, startTop, endPage, endY, lines: dropRunningHeaders(ctx, lines) };
}

/** Indices (into region.lines) where entries start. */
function entryStarts(
	ctx: DocContext,
	region: BibliographyRegion,
	citeTargets: Map<string, ResolvedTarget>
): number[] {
	const lines = region.lines;
	// 1. [key] prefixes.
	const bracket = lines
		.map((l, i) => (/^\s*\[[^\]]{1,30}\]/.test(l.text) ? i : -1))
		.filter((i) => i >= 0);
	if (bracket.length >= 3) return bracket;
	// 2. "12." numbering, mostly increasing.
	const numbered = lines
		.map((l, i) => (/^\s*\d{1,3}\.\s+\p{Lu}/u.test(l.text) ? i : -1))
		.filter((i) => i >= 0);
	if (numbered.length >= 3) return numbered;
	// 3. cite.* targets: each points at an entry.
	if (citeTargets.size >= 3) {
		const starts = new Set<number>();
		for (const t of citeTargets.values()) {
			const y = t.point?.[1];
			if (y === undefined || !Number.isFinite(y)) continue;
			const x = t.point?.[0];
			let best = -1;
			let bestD = Infinity;
			lines.forEach((l, i) => {
				if (l.page !== t.page) return;
				// The XYZ top is at (or a bit above) the first line's top.
				const dy = y - l.top;
				if (dy < -3) return;
				const dx = x !== undefined && Number.isFinite(x) ? Math.max(0, Math.abs(l.x - x) - 2) : 0;
				const d = dy + dx * 3;
				if (d < bestD) {
					bestD = d;
					best = i;
				}
			});
			if (best >= 0 && bestD < 25) starts.add(best);
		}
		if (starts.size >= 3) {
			const sorted = [...starts].sort((a, b) => a - b);
			// Entries before the first target (rare) are folded into it.
			if (sorted[0] !== 0) sorted[0] = 0;
			return sorted;
		}
	}
	// 4. Layout: hanging indent or extra spacing between entries.
	return layoutStarts(ctx, lines);
}

function layoutStarts(ctx: DocContext, lines: Line[]): number[] {
	const starts: number[] = [];
	// Column left edges per page: smallest x of lines in the left/right half.
	const colLeft = (l: Line) => {
		const w = ctx.src.pageSize(l.page).width;
		const same = lines.filter((o) => o.page === l.page && o.x < w * 0.45 === l.x < w * 0.45);
		return Math.min(...same.map((o) => o.x));
	};
	const indented = lines.filter((l) => l.x > colLeft(l) + 4).length;
	const hanging = indented > lines.length * 0.25;
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i];
		const prev = lines[i - 1];
		const atLeft = l.x <= colLeft(l) + 1.5;
		if (!prev) {
			starts.push(i);
			continue;
		}
		const sameColumn = prev.page === l.page && Math.abs(prev.x - l.x) < 60;
		const gap = sameColumn ? prev.bottom - l.top : 0;
		const lineH = l.top - l.bottom;
		if (
			hanging
				? atLeft
				: gap > lineH * 0.45 || (!sameColumn && atLeft && /[.)]$/.test(prev.text.trim()))
		)
			starts.push(i);
	}
	return starts;
}

/** Page numbers and running headers/footers inside the region. */
function dropRunningHeaders(ctx: DocContext, lines: Line[]): Line[] {
	const counts = new Map<string, number>();
	for (const page of ctx.lines)
		for (const l of page) counts.set(l.text.trim(), (counts.get(l.text.trim()) ?? 0) + 1);
	return lines.filter(
		(l) => !isPageNumber(l) && !((counts.get(l.text.trim()) ?? 0) > 3 && l.text.trim().length < 80)
	);
}

function isPageNumber(l: Line) {
	return /^\s*\d{1,4}\s*$/.test(l.text);
}

// ── Entry parsing ───────────────────────────────────────────────────────────

const NOT_SENTENCE_END =
	/(?:\b\p{Lu}|\bvs|\bProc|\bConf|\bInt|\bVol|\bvol|\bno|\bNo|\bpp|\bed|\beds|\bJr|\bSt|\bDr|\bInc|\bCorp|\bDept|\bUniv|\bJ|\bTrans|\bAdv|\bAssoc|\bComput|\bLing|\bMach|\bNeural|\bInf|\bProcess|\bSyst|\bRes|\bStat|\bMath|\bPhys|\bRev|\bLett|\bNucl|\bCommun|\bClass|\bQuant|\bGrav|\bMod|\bTheor|\bAnn|\bAstrophys|\bAstron|\bJ)$/u;

/** Parse a bibliography entry (best effort, style-agnostic). */
export function parseReference(raw: string): ParsedReference {
	const s = raw.replace(/^\s*\[[^\]]{1,30}\]\s*/, '').replace(/^\s*\d{1,3}\.\s+/, '');
	const out: ParsedReference = { authors: [], surnames: [] };

	const doi = /\b(10\.\d{4,9}\/[^\s,;]+)/.exec(s);
	if (doi) out.doi = doi[1].replace(/[.)\]]+$/, '');
	const arxiv =
		/arXiv(?:\s+preprint)?\s*:?\s*(?:arXiv:)?\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i.exec(
			s
		) ??
		/\babs\/(\d{4}\.\d{4,5})/.exec(s) ??
		/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})/i.exec(s);
	if (arxiv) out.arxivId = arxiv[1];
	const url = /\bhttps?:\/\/[^\s]+/.exec(s);
	if (url) out.url = url[0].replace(/[.,;)\]]+$/, '');

	const sentences = splitSentences(s);
	// Authors: the first sentence (unless it is just a year).
	let idx = 0;
	if (sentences[0] && looksLikeAuthors(sentences[0])) {
		out.authors = splitAuthors(sentences[0]);
		idx = 1;
	}
	// Author-year styles put the year right after the authors: "… Hinton. 2016. Title."
	const yearOnly = /^\(?((?:19|20)\d{2})([a-z])?\)?$/.exec(sentences[idx]?.trim() ?? '');
	if (yearOnly) {
		out.year = Number(yearOnly[1]);
		out.yearSuffix = yearOnly[2];
		idx++;
	}
	// "(2016)" glued to the authors sentence: "Ba, J. (2016). Title."
	if (!out.year && sentences[0]) {
		const g = /\(((?:19|20)\d{2})([a-z])?\)\s*$/.exec(sentences[0]);
		if (g) {
			out.year = Number(g[1]);
			out.yearSuffix = g[2];
			out.authors = splitAuthors(sentences[0].slice(0, g.index));
		}
	}
	const title = sentences[idx]?.trim();
	if (title)
		out.title = title
			.replace(/^["“'‘]|["”'’]$/g, '')
			.replace(/[,.]$/, '')
			.trim();
	const rest = sentences
		.slice(idx + 1)
		.join('. ')
		.trim();
	if (rest) {
		const venue = rest
			.replace(/\b(?:19|20)\d{2}[a-z]?\b\.?/g, '')
			.replace(/\bpp?\.\s*[\d–-]+|\b\d+\s*[–-]\s*\d+\b/g, '')
			.replace(/\bdoi:\s*\S+|https?:\/\/\S+/gi, '')
			.replace(/[\s,.;:]+$/g, '')
			.replace(/^\s*In\s+/, '')
			.trim();
		if (venue) out.venue = venue.slice(0, 160);
	}
	if (!out.year) {
		const years = [...s.matchAll(/\b((?:19|20)\d{2})([a-z])?\b/g)];
		const y = years.at(-1);
		if (y) {
			out.year = Number(y[1]);
			out.yearSuffix = y[2];
		}
	}
	out.surnames = out.authors.map(surnameOf).filter(Boolean);
	return out;
}

function splitSentences(s: string): string[] {
	const out: string[] = [];
	let start = 0;
	const re = /[.?!]\s+(?=[\p{Lu}\d"“'‘([]|arXiv|ar[Xx]iv|abs\/|https?:|doi)/gu;
	for (let m = re.exec(s); m; m = re.exec(s)) {
		const before = s.slice(start, m.index);
		// Keep initials ("Y. Bengio") and abbreviations together.
		if (NOT_SENTENCE_END.test(before)) continue;
		out.push(before.trim());
		start = m.index + m[0].length;
	}
	const tail = s.slice(start).trim();
	if (tail) out.push(tail.replace(/\.$/, ''));
	return out.filter(Boolean);
}

function looksLikeAuthors(s: string) {
	if (s.length > 600) return false;
	if (/^\(?(19|20)\d{2}/.test(s)) return false;
	// Names: capitalised words separated by commas/and, few lowercase words.
	const words = s.split(/\s+/);
	const lower = words.filter(
		(w) => /^\p{Ll}/u.test(w) && !/^(and|et|al\.?|van|von|de|der|da|di|le|la|du|del|dos)$/.test(w)
	).length;
	return lower <= Math.max(1, words.length * 0.15) && /\p{Lu}/u.test(s);
}

const JOURNAL_WORD =
	/^(Phys|Nucl|Lett|Rev|Proc|Ann|Commun|Math|JHEP|Nature|Science|Jour|Trans|Adv|Int|Mod|Class|Quant|Grav|Gen|Rel|Prog|Theor|Lect|Notes|Acta|Eur|Rep|Sov|Zh|Eksp|Teor|Fiz)\.?$/;

function isName(p: string) {
	if (/\d|\/|:/.test(p) || p.length > 60) return false;
	const words = p.split(/\s+/);
	if (words.length > 7 || words.some((w) => JOURNAL_WORD.test(w))) return false;
	// Every word capitalised (allowing particles), at least one real word.
	return (
		words.every((w) => /^(\p{Lu}|van|von|de|der|da|di|le|la|du|del|dos|den|ter|bin|al)/u.test(w)) &&
		/\p{L}{2}/u.test(p)
	);
}

function splitAuthors(s: string): string[] {
	const cleaned = s
		.replace(/\bet al\.?/g, '')
		.replace(/\(eds?\.?\)|\beditors?\b/gi, '')
		.trim();
	let parts = cleaned
		.split(/\s*(?:,|;|\band\b|&)\s*/)
		.map((p) => p.trim())
		.filter(Boolean);
	// "Bengio, Y., Simard, P." → surname-first pairs.
	const initials = (p: string) => /^(?:\p{Lu}\.?\s?-?)+$/u.test(p);
	if (
		parts.length >= 2 &&
		parts.filter(initials).length >= parts.length / 2 - 1 &&
		initials(parts[1] ?? '')
	) {
		const paired: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			if (initials(parts[i + 1] ?? '')) {
				paired.push(`${parts[i + 1]} ${parts[i]}`);
				i++;
			} else paired.push(parts[i]);
		}
		parts = paired;
	}
	// Stop at the first part that is not a name (journal, arXiv id, year…).
	const out: string[] = [];
	for (const p of parts) {
		if (!isName(p)) break;
		out.push(p);
	}
	return out;
}

/** Family name of "Geoffrey E Hinton", "Y. Bengio", "van der Maaten", "Hinton, G.". */
export function surnameOf(name: string): string {
	const n = name.replace(/,?\s*(Jr\.?|Sr\.?|II|III)$/, '').trim();
	if (n.includes(',')) return n.split(',')[0].trim();
	const words = n.split(/\s+/).filter((w) => !/^\p{Lu}\.?$/u.test(w));
	return words[words.length - 1] ?? n;
}

/** "Smith", "Smith and Lee", "Smith et al." */
function authorsLabel(surnames: string[]): string {
	if (surnames.length === 1) return surnames[0];
	if (surnames.length === 2) return `${surnames[0]} and ${surnames[1]}`;
	return `${surnames[0]} et al.`;
}

function labelOf(r: Reference, style: ReferencesResult['style']): string {
	if ((style === 'numeric' || style === 'alpha') && r.key) return `[${r.key}]`;
	const s = r.parsed.surnames;
	if (!s.length) return r.key ? `[${r.key}]` : `[${r.index}]`;
	const who = authorsLabel(s);
	return r.parsed.year ? `${who}, ${r.parsed.year}${r.parsed.yearSuffix ?? ''}` : who;
}

/** The text line of a section heading (matched by position and title). */
function headingLineOf(ctx: DocContext, s: Section): Line | null {
	const lines = ctx.lines[s.page - 1] ?? [];
	const key = s.title.toLowerCase().slice(0, 12);
	return (
		lines.find((l) => Math.abs(l.top - s.y) < 1.5 && l.text.toLowerCase().includes(key)) ??
		lines.find((l) => Math.abs(l.top - s.y) < 1.5) ??
		null
	);
}
