/**
 * Cross-references in the text: "Figure 3", "Table 2", "Section 4.1",
 * "Eq. (5)", "Appendix B" → their targets. hyperref links first, regex after.
 */
import { quadsBounds } from '../text/text-index.js';
import { targetY, type DocContext } from './context.js';
import { nearestFigure } from './figures.js';
import { rangeInRect } from './lines.js';
import { flattenSections, sectionAt } from './sections.js';
import type { CrossRef, CrossRefKind, Figure, FigureKind, PaperLink, Section } from './types.js';

const WORD_BEFORE =
	/(Figures?|Figs?\.|Tables?|Tabs?\.|Sections?|Secs?\.|§|Equations?|Eqs?\.|Appendix|Appendices|Algorithms?|Alg\.|Theorem|Lemma|Corollary|Definition)\s*~?\(?$/;
const TEXT_REF =
	/\b(Figures?|Figs?\.|Tables?|Tabs?\.|Sections?|Secs?\.|Equations?|Eqs?\.|Appendix|Algorithms?|Alg\.)\s*~?\(?((?:\d+|[A-Z])(?:\.\d+)*)\)?|§\s*((?:\d+|[A-Z])(?:\.\d+)*)/g;

const linkKindToRef: Partial<Record<PaperLink['kind'], CrossRefKind>> = {
	figure: 'figure',
	table: 'table',
	section: 'section',
	equation: 'equation',
	footnote: 'footnote',
	page: 'page',
	algorithm: 'algorithm',
	theorem: 'theorem'
};

/** Max vertical distance (pt) between a link target and a heading for it to land "on" that heading. */
const HEADING_TOLERANCE = 25;

/** Reference word prefix → kind; anything else ("Section", "§") is a section. */
const WORD_KINDS: [prefix: string, kind: CrossRefKind][] = [
	['fig', 'figure'],
	['tab', 'table'],
	['alg', 'algorithm'],
	['eq', 'equation'],
	['app', 'appendix']
];

function textRefKind(word: string): CrossRefKind {
	return WORD_KINDS.find(([prefix]) => word.startsWith(prefix))?.[1] ?? 'section';
}

const isFigureKind = (kind: CrossRefKind): kind is FigureKind =>
	kind === 'figure' || kind === 'table' || kind === 'algorithm';

export function extractCrossRefs(
	ctx: DocContext,
	links: PaperLink[],
	figures: Figure[],
	sections: Section[],
	excluded: (page: number, offset: number) => boolean
): CrossRef[] {
	const out: Omit<CrossRef, 'id'>[] = [];
	const flat = flattenSections(sections);

	for (const link of links) {
		const kind = linkRefKind(link, flat);
		if (!kind) continue;
		const text = ctx.texts[link.page - 1];
		const range = rangeInRect(text, link.rect);
		if (!range || excluded(link.page, range[0])) continue;
		let [start, end] = range;
		// Links often cover only the number: include "Figure " / "Eq. (" before it.
		const m = WORD_BEFORE.exec(text.raw.slice(Math.max(0, start - 14), start));
		if (m) start -= m[0].length;
		if (text.raw[end] === ')' && text.raw.slice(start, end).includes('(')) end++;
		while (end > start + 1 && /[.,;:\s]/.test(text.raw[end - 1])) end--;
		while (start < end - 1 && /\s/.test(text.raw[start])) start++;
		const target = link.target;
		let targetId: string | undefined;
		let finalKind = kind;
		if (target && isFigureKind(kind)) {
			targetId = nearestFigure(figures, target.page, targetY(target), kind, 150)?.id;
		} else if (target && kind === 'section') {
			const y = targetY(target);
			const s =
				flat.find((x) => x.page === target.page && Math.abs(x.y - y) < HEADING_TOLERANCE) ??
				sectionAt(sections, target.page, y);
			targetId = s?.id;
			const appendixDest = typeof link.dest === 'string' && link.dest.startsWith('appendix');
			if (s?.kind === 'appendix' || appendixDest) finalKind = 'appendix';
		}
		out.push({
			page: link.page,
			start,
			end,
			text: text.raw.slice(start, end),
			quads: [],
			rect: link.rect,
			kind: finalKind,
			targetId,
			target,
			dest: link.dest,
			source: 'link'
		});
	}

	const covered = (page: number, s: number, e: number) =>
		out.some((r) => r.page === page && s < r.end && e > r.start);
	for (let p = 1; p <= ctx.numPages; p++) {
		const text = ctx.texts[p - 1];
		for (const m of text.raw.matchAll(TEXT_REF)) {
			const s = m.index;
			const e = s + m[0].length;
			if (covered(p, s, e) || excluded(p, s)) continue;
			const word = (m[1] ?? '§').toLowerCase();
			const number = m[2] ?? m[3];
			// Single letters only number sections/appendices ("Appendix B"), not equations or figures.
			let kind = textRefKind(word);
			if (/^[A-Z]$/.test(number) && kind !== 'section' && kind !== 'appendix') continue;
			let targetId: string | undefined;
			let target: CrossRef['target'];
			if (isFigureKind(kind)) {
				const f = figures.find((x) => x.kind === kind && x.number === number);
				// The caption's own label is not a reference.
				const isCaptionLabel =
					f?.page === p && Math.abs(f.captionRect[3] - (text.rectFor(s, e)?.[3] ?? -1)) < 2;
				if (isCaptionLabel) continue;
				if (f) {
					targetId = f.id;
					target = { page: f.page, point: [f.rect[0], f.rect[3]], rect: f.rect };
				}
			} else if (kind === 'section' || kind === 'appendix') {
				const sec = flat.find((x) => x.number === number);
				if (sec) {
					targetId = sec.id;
					target = { page: sec.page, point: [0, sec.y] };
					if (sec.kind === 'appendix') kind = 'appendix';
				}
			}
			out.push({
				page: p,
				start: s,
				end: e,
				text: m[0],
				quads: [],
				rect: [0, 0, 0, 0],
				kind,
				targetId,
				target,
				source: 'text'
			});
		}
	}

	out.sort((a, b) => a.page - b.page || a.start - b.start);
	return out.map((r, i) => {
		const quads = ctx.texts[r.page - 1].quadsFor(r.start, r.end);
		return { ...r, id: `xref-${i + 1}`, quads, rect: quadsBounds(quads) ?? r.rect };
	});
}

/**
 * Cross-ref kind of a hyperref link, if any. Unnamed links count as section
 * references only when they land on a heading.
 */
function linkRefKind(link: PaperLink, flat: Section[]): CrossRefKind | undefined {
	const named = linkKindToRef[link.kind];
	if (named) return named;
	const target = link.target;
	if (link.kind !== 'other' || !target) return undefined;
	const y = target.point?.[1] ?? -1e9;
	const onHeading = flat.some(
		(x) =>
			x.kind !== 'references' && x.page === target.page && Math.abs(x.y - y) < HEADING_TOLERANCE
	);
	return onHeading ? 'section' : undefined;
}
