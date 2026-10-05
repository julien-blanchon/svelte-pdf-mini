/**
 * Re-anchoring: when a markup's quads no longer cover its quote (another
 * version of the paper, an import from another app, a re-typeset preprint),
 * find the quote again in the page text and recompute the quads.
 * Strategy (like Hypothesis): exact match on normalized text, disambiguated by
 * prefix/suffix similarity and distance to the original position.
 */
import { normalizeQuery, type PageText } from '../text/text-index.js';
import { rectFromQuads } from './create.js';
import type { Annotation, TextMarkupAnnotation } from './model.js';
import { isTextMarkup } from './model.js';

export interface AnchorResult {
	annotation: TextMarkupAnnotation;
	/** 'ok' = already anchored, 'moved' = new position found, 'orphan' = quote not found. */
	status: 'ok' | 'moved' | 'orphan';
	/** 0..1 confidence for 'moved'. */
	score: number;
}

/** Does the text under the quads still match the quote? */
export function isAnchored(a: TextMarkupAnnotation, text: PageText): boolean {
	if (!a.quote?.exact) return true;
	const here = normalizeQuery(text.textInQuads(a.quads));
	const want = normalizeQuery(a.quote.exact);
	return (
		!!here &&
		(here === want || here.includes(want) || want.includes(here)) &&
		Math.abs(here.length - want.length) < Math.max(4, want.length * 0.15)
	);
}

/** Re-anchor one markup on `text` (its page, or a candidate page). */
export function reanchor(a: TextMarkupAnnotation, text: PageText): AnchorResult {
	if (!a.quote?.exact || isAnchored(a, text)) return { annotation: a, status: 'ok', score: 1 };
	const exact = normalizeQuery(a.quote.exact);
	const prefix = normalizeQuery(a.quote.prefix ?? '');
	const suffix = normalizeQuery(a.quote.suffix ?? '');
	let best: { start: number; end: number; score: number } | null = null;
	let from = 0;
	while (exact) {
		const i = text.norm.indexOf(exact, from);
		if (i < 0) break;
		from = i + 1;
		const before = text.norm.slice(Math.max(0, i - prefix.length - 1), i).trim();
		const after = text.norm.slice(i + exact.length, i + exact.length + suffix.length + 1).trim();
		const [rs, re] = text.normRangeToRaw(i, i + exact.length);
		const ctx = (similarity(before, prefix) + similarity(after, suffix)) / 2;
		const dist =
			a.quote.start != null
				? Math.min(1, Math.abs(rs - a.quote.start) / Math.max(1, text.length))
				: 0.5;
		const score = 0.75 * ctx + 0.25 * (1 - dist);
		if (!best || score > best.score) best = { start: rs, end: re, score };
	}
	if (!best) return { annotation: a, status: 'orphan', score: 0 };
	const quads = text.quadsFor(best.start, best.end);
	return {
		annotation: {
			...a,
			quads,
			rect: rectFromQuads(quads),
			quote: { ...a.quote, start: best.start, end: best.end }
		},
		status: 'moved',
		score: best.score
	};
}

/**
 * Re-anchor every markup in a list. `getPageText(page)` provides text; markups
 * not found on their page are searched on `searchPages` neighbours (default ±1).
 */
export async function reanchorAll(
	annotations: Annotation[],
	getPageText: (page: number) => Promise<PageText | null>,
	{ searchPages = 1, numPages = Infinity }: { searchPages?: number; numPages?: number } = {}
): Promise<{ annotations: Annotation[]; moved: number; orphans: number }> {
	let moved = 0;
	let orphans = 0;
	const out: Annotation[] = [];
	for (const a of annotations) {
		if (!isTextMarkup(a) || !a.quote?.exact) {
			out.push(a);
			continue;
		}
		let result: AnchorResult | null = null;
		for (const d of [
			0,
			...Array.from({ length: searchPages }, (_, i) => [i + 1, -(i + 1)]).flat()
		]) {
			const page = a.page + d;
			if (page < 1 || page > numPages) continue;
			const text = await getPageText(page);
			if (!text) continue;
			const r = reanchor({ ...a, page }, text);
			if (r.status !== 'orphan') {
				result = d === 0 ? r : { ...r, status: 'moved' };
				break;
			}
		}
		if (!result) {
			orphans++;
			out.push({ ...a, extra: { ...a.extra, orphan: true } });
		} else {
			if (result.status === 'moved') moved++;
			out.push(
				result.status === 'moved'
					? { ...result.annotation, extra: { ...result.annotation.extra, reanchored: true } }
					: result.annotation
			);
		}
	}
	return { annotations: out, moved, orphans };
}

/** Dice coefficient on character bigrams (0..1). */
function similarity(a: string, b: string): number {
	if (!a && !b) return 1;
	if (!a || !b) return 0;
	const grams = (s: string) => {
		const m = new Map<string, number>();
		for (let i = 0; i < s.length - 1; i++)
			m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
		return m;
	};
	const A = grams(a);
	const B = grams(b);
	let inter = 0;
	for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
	return (2 * inter) / Math.max(1, a.length - 1 + b.length - 1);
}
