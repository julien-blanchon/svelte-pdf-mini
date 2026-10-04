/**
 * In-text citations. Link annotations pointing into the bibliography are the
 * ground truth (hyperref `cite.*`, or any internal link whose target lies in
 * the reference list); text patterns fill the gaps for PDFs without links.
 */
import { quadsBounds } from '../text/text-index.js';
import type { DocContext } from './context.js';
import { rangeInRect } from './lines.js';
import { kindOfDest } from './links.js';
import {
	inBibliographyRegion,
	refAtTarget,
	surnameOf,
	type ReferencesResult
} from './references.js';
import type { InTextCitation, Reference, ResolvedTarget } from './types.js';

interface Hit {
	page: number;
	start: number;
	end: number;
	refs: Set<string>;
	source: 'link' | 'text';
}

export async function extractCitations(
	ctx: DocContext,
	refs: ReferencesResult
): Promise<InTextCitation[]> {
	const { references, region, style } = refs;
	if (!references.length) return [];
	const byDest = new Map<string, Reference>();
	for (const r of references) for (const d of r.dests) byDest.set(d, r);
	const inRegion = (t: ResolvedTarget) => !!region && inBibliographyRegion(t, region);
	const inBibliography = (page: number, offset: number) =>
		references.some((r) =>
			r.ranges.some((g) => g.page === page && offset >= g.start && offset < g.end)
		);

	const hits: Hit[] = [];
	// 1. Links. The visible key ("41", "BMR+20") is the most reliable mapping;
	// then the destination name (voted from keyed links); then the target position.
	const keyOf = (k: string) => k.replace(/\s+/g, '').toLowerCase();
	const byKeyEarly = new Map(references.filter((r) => r.key).map((r) => [keyOf(r.key!), r]));
	const pending: {
		page: number;
		range: [number, number];
		dest: string | unknown[];
		text: string;
	}[] = [];
	const votes = new Map<string, Map<string, number>>();
	for (let p = 1; p <= ctx.numPages; p++) {
		const text = ctx.texts[p - 1];
		for (const link of ctx.links[p - 1]) {
			if (!link.dest) continue;
			const isCite = typeof link.dest === 'string' && link.dest.startsWith('cite.');
			// Named destinations of other kinds (section., appendix., figure.…) are never citations.
			if (typeof link.dest === 'string' && !isCite && kindOfDest(link.dest) !== 'other') continue;
			const range = rangeInRect(text, link.rect);
			if (!range || inBibliography(p, range[0])) continue;
			const shown = text.raw.slice(range[0], range[1]).replace(/^[[(\s,;]+|[\])\s,;.]+$/g, '');
			if (!isCite) {
				// Unnamed links: a visible reference key ("7", "BMR+20") is enough; otherwise
				// the target must land in the bibliography.
				const looksKeyed =
					byKeyEarly.has(keyOf(shown)) || /^\d{1,3}(?:\s*[-–—,;]\s*\d{1,3})+$/.test(shown);
				const t = await ctx.resolve(link.dest);
				if (!t) continue;
				const onBibPage =
					!!region &&
					t.page >= region.startPage - 1 &&
					t.page <= Math.min(region.endPage, ctx.numPages);
				if (!(looksKeyed ? onBibPage : inRegion(t))) continue;
			}
			// One link covering a whole list ("7,8,9–13").
			if (/^\d{1,3}(?:\s*[-–—,;]\s*\d{1,3})+$/.test(shown)) {
				const ids = expandNumbers(shown)
					.map((n) => byKeyEarly.get(String(n))?.id)
					.filter((x): x is string => !!x);
				if (ids.length) {
					hits.push({
						page: p,
						start: range[0],
						end: range[1],
						refs: new Set(ids),
						source: 'link'
					});
					continue;
				}
			}
			const keyed = byKeyEarly.get(keyOf(shown));
			if (keyed) {
				hits.push({
					page: p,
					start: range[0],
					end: range[1],
					refs: new Set([keyed.id]),
					source: 'link'
				});
				if (typeof link.dest === 'string') {
					const v = votes.get(link.dest) ?? new Map<string, number>();
					v.set(keyed.id, (v.get(keyed.id) ?? 0) + 1);
					votes.set(link.dest, v);
				}
			} else pending.push({ page: p, range, dest: link.dest, text: shown });
		}
	}
	const byId = new Map(references.map((r) => [r.id, r]));
	for (const [dest, v] of votes) {
		const top = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
		const ref = top && byId.get(top[0]);
		if (ref) {
			byDest.set(dest, ref);
			if (!ref.dests.includes(dest)) ref.dests.push(dest);
		}
	}
	const ayIndex = authorYearIndex(references);
	for (const h of pending) {
		let ref: Reference | null | undefined =
			typeof h.dest === 'string' ? byDest.get(h.dest) : undefined;
		if (!ref) {
			// Author-year link text: "Vaswani et al., 2017" or "Vaswani et al. (2017)".
			const m = /(\p{Lu}[\p{L}'’-]+)[^\d]*((?:19|20)\d{2})([a-z])?/u.exec(h.text);
			if (m)
				ref =
					ayIndex.get(`${norm(m[1])}|${m[2]}${m[3] ?? ''}`) ?? ayIndex.get(`${norm(m[1])}|${m[2]}`);
		}
		if (!ref) {
			const t = await ctx.resolve(h.dest);
			if (t) ref = refAtTarget(references, t);
		}
		if (ref)
			hits.push({
				page: h.page,
				start: h.range[0],
				end: h.range[1],
				refs: new Set([ref.id]),
				source: 'link'
			});
	}

	// 2. Text patterns.
	const covered = (page: number, s: number, e: number) =>
		hits.some((h) => h.page === page && s < h.end && e > h.start);
	const byKey = new Map(references.filter((r) => r.key).map((r) => [r.key!.toLowerCase(), r]));
	const textKey = (k: string) => k.replace(/\s+/g, '').toLowerCase();
	const byIndex = new Map(references.map((r) => [r.index, r]));
	for (let p = 1; p <= ctx.numPages; p++) {
		const raw = ctx.texts[p - 1].raw;
		const add = (s: number, e: number, ids: string[]) => {
			if (!ids.length || covered(p, s, e) || inBibliography(p, s)) return;
			hits.push({ page: p, start: s, end: e, refs: new Set(ids), source: 'text' });
		};
		if (style === 'numeric' || style === 'unknown') {
			for (const m of raw.matchAll(/\[(\d{1,3}(?:\s*[-–—,;]\s*\d{1,3}){0,20})\]/g)) {
				const ids = expandNumbers(m[1])
					.map(
						(n) => (byKey.get(String(n)) ?? (style === 'numeric' ? undefined : byIndex.get(n)))?.id
					)
					.filter((x): x is string => !!x);
				add(m.index, m.index + m[0].length, ids);
			}
		}
		if (style === 'alpha') {
			for (const m of raw.matchAll(/\[([^\]\n]{2,80})\]/g)) {
				const ids = m[1]
					.split(/\s*[,;]\s*/)
					.map((k) => byKey.get(textKey(k))?.id)
					.filter((x): x is string => !!x);
				add(m.index, m.index + m[0].length, ids);
			}
		}
		if (style === 'author-year' || style === 'unknown') {
			const index = authorYearIndex(references);
			const re =
				/(\p{Lu}[\p{L}'’-]+)(?:\s+(?:et\s+al\.?|and|&)\s*(?:\p{Lu}[\p{L}'’-]+)?)?,?\s*\(?((?:19|20)\d{2})([a-z])?\)?/gu;
			for (const m of raw.matchAll(re)) {
				const ref =
					index.get(`${norm(m[1])}|${m[2]}${m[3] ?? ''}`) ?? index.get(`${norm(m[1])}|${m[2]}`);
				if (ref) add(m.index, m.index + m[0].length, [ref.id]);
			}
		}
	}

	return groupHits(ctx, hits);
}

/** "3, 5–7" → [3, 5, 6, 7]. */
export function expandNumbers(s: string): number[] {
	const out: number[] = [];
	for (const part of s.split(/\s*[,;]\s*/)) {
		const r = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part.trim());
		if (r) {
			const a = Number(r[1]);
			const b = Number(r[2]);
			if (b >= a && b - a < 50) for (let n = a; n <= b; n++) out.push(n);
		} else if (/^\d+$/.test(part.trim())) out.push(Number(part.trim()));
	}
	return out;
}

const norm = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

function authorYearIndex(references: Reference[]) {
	const index = new Map<string, Reference>();
	for (const r of references) {
		const surname =
			r.parsed.surnames[0] ?? (r.parsed.authors[0] ? surnameOf(r.parsed.authors[0]) : '');
		if (!surname || !r.parsed.year) continue;
		index.set(`${norm(surname)}|${r.parsed.year}${r.parsed.yearSuffix ?? ''}`, r);
		if (!index.has(`${norm(surname)}|${r.parsed.year}`))
			index.set(`${norm(surname)}|${r.parsed.year}`, r);
	}
	return index;
}

/**
 * Merge hits separated only by punctuation ("[3, 5]" made of two links, or
 * "Vaswani et al., 2017; Devlin et al., 2019") and widen to enclosing brackets.
 */
function groupHits(ctx: DocContext, hits: Hit[]): InTextCitation[] {
	hits.sort((a, b) => a.page - b.page || a.start - b.start);
	const groups: Hit[] = [];
	for (const h of hits) {
		const g = groups[groups.length - 1];
		if (g && g.page === h.page) {
			const between = ctx.texts[h.page - 1].raw.slice(g.end, h.start);
			if (h.start <= g.end || /^[\s,;.(–—-]{0,5}$/.test(between)) {
				g.end = Math.max(g.end, h.end);
				for (const r of h.refs) g.refs.add(r);
				if (h.source === 'link') g.source = 'link';
				continue;
			}
		}
		groups.push({ ...h, refs: new Set(h.refs) });
	}
	return groups.map((g, i) => {
		const text = ctx.texts[g.page - 1];
		const [start, end] = balance(text.raw, g.start, g.end);
		const quads = text.quadsFor(start, end);
		return {
			id: `cit-${i + 1}`,
			page: g.page,
			start,
			end,
			text: text.raw.slice(start, end),
			quads,
			rect: quadsBounds(quads) ?? [0, 0, 0, 0],
			referenceIds: [...g.refs],
			source: g.source
		};
	});
}

/**
 * Tidy a citation range: drop trailing punctuation, and close brackets or
 * parentheses that the links (or the width estimate) left open.
 */
function balance(raw: string, start: number, end: number): [number, number] {
	let s = start;
	let e = end;
	while (e > s + 1 && /[\s.,;:]/.test(raw[e - 1])) e--;
	while (s < e - 1 && /[\s,;]/.test(raw[s])) s++;
	const pairs: [string, string][] = [
		['[', ']'],
		['(', ')']
	];
	for (const [open, close] of pairs) {
		const t = raw.slice(s, e);
		const opens = t.split(open).length - 1;
		const closes = t.split(close).length - 1;
		if (closes > opens) {
			// Look left (same line) for the opener.
			const i = raw.lastIndexOf(open, s);
			if (i !== -1 && s - i <= 4 && !raw.slice(i, s).includes('\n')) s = i;
		} else if (opens > closes) {
			const i = raw.indexOf(close, e);
			if (i !== -1 && i - e <= (open === '(' ? 40 : 6)) e = i + 1;
		} else if (!opens && open === '[' && !t.includes('(')) {
			// A bare key list ("3", "Tur20"): include brackets right around it.
			const i = raw.lastIndexOf('[', s);
			const j = raw.indexOf(']', e - 1);
			if (i !== -1 && j !== -1 && s - i <= 3 && j - e <= 3 && /^[\s]*$/.test(raw.slice(i + 1, s))) {
				s = i;
				e = j + 1;
			}
		}
	}
	return [s, e];
}
