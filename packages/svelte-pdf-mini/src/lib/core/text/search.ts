/**
 * Full-text search over `PageText`. Matching runs on the normalised text
 * (case-, diacritic-, ligature- and hyphenation-insensitive by default) and
 * maps hits back to raw page offsets, so results can be drawn and quoted.
 */
import { cleanQuote, normalizeQuery, type PageText } from './text-index.js';

export interface SearchOptions {
	/** Match case exactly. */
	caseSensitive?: boolean;
	/** Match accents exactly (é ≠ e). */
	diacritics?: boolean;
	/** Only whole words. */
	wholeWord?: boolean;
	/** Treat the query as a regular expression (applied to normalised text). */
	regex?: boolean;
}

export interface SearchMatch {
	page: number;
	/** Raw page-text offsets (end exclusive). */
	start: number;
	end: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compile a query to a global regex over normalised text, or null when empty/invalid. */
export function compileQuery(query: string, opts: SearchOptions = {}): RegExp | null {
	const q = opts.regex ? query : normalizeQuery(query);
	if (!q) return null;
	let source = opts.regex ? q : escape(q).replace(/ /g, '\\s*');
	if (opts.wholeWord) source = `(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`;
	try {
		return new RegExp(source, opts.regex ? 'giu' : 'gu');
	} catch {
		return null;
	}
}

/** Search one page. */
export function searchPageText(
	text: PageText,
	query: string,
	opts: SearchOptions = {}
): SearchMatch[] {
	const re = compileQuery(query, opts);
	if (!re) return [];
	const matches: SearchMatch[] = [];
	const strict = opts.caseSensitive || opts.diacritics;
	const wanted = strict ? strictForm(query, opts) : '';
	for (const m of text.norm.matchAll(re)) {
		if (!m[0].length) continue;
		const [start, end] = text.normRangeToRaw(m.index, m.index + m[0].length);
		if (strict && !opts.regex && strictForm(text.raw.slice(start, end), opts) !== wanted) continue;
		matches.push({ page: text.page, start, end });
	}
	return matches;
}

/** Context around a match for result lists. */
export function matchSnippet(text: PageText, m: SearchMatch, context = 48) {
	const before = cleanQuote(text.raw.slice(Math.max(0, m.start - context), m.start), {
		trim: false
	}).trimStart();
	const match = cleanQuote(text.raw.slice(m.start, m.end));
	const after = cleanQuote(text.raw.slice(m.end, m.end + context), { trim: false }).trimEnd();
	return {
		before: (m.start > context ? '…' : '') + before,
		match,
		after: after + (m.end + context < text.raw.length ? '…' : '')
	};
}

function strictForm(s: string, opts: SearchOptions) {
	let out = cleanQuote(s).replace(/\s+/g, '');
	if (!opts.caseSensitive) out = out.toLowerCase();
	if (!opts.diacritics) out = out.normalize('NFKD').replace(/\p{M}/gu, '');
	return out;
}
