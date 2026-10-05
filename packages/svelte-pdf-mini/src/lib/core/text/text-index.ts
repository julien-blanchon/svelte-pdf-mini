/**
 * Per-page text index.
 *
 * Turns pdf.js `TextContent` into:
 * - `raw`: the page text (items concatenated, with `\n` at line ends and a
 *   space where items are visibly apart), plus a map from raw offsets to items;
 * - geometry: PDF-space quads (Z order: TL, TR, BL, BR) for any raw range;
 * - `norm`: a search-friendly normalization (NFKD, no diacritics, ligatures
 *   expanded, de-hyphenated line ends, collapsed whitespace) with a map back to
 *   raw offsets.
 *
 * Plain TypeScript: no DOM, usable in workers and tests.
 */
import type { PdfRect } from '../types.js';
import { distanceToRange } from '../view/geometry.js';

/** 8 numbers: TL(x,y) TR(x,y) BL(x,y) BR(x,y), PDF user space. */
export type Quad = [number, number, number, number, number, number, number, number];

export interface TextItemLike {
	str: string;
	/** [a, b, c, d, e, f] text matrix in PDF space. */
	transform: number[];
	width: number;
	height: number;
	dir?: string;
	fontName?: string;
	hasEOL?: boolean;
}

export interface TextStyleLike {
	ascent?: number;
	descent?: number;
	vertical?: boolean;
	fontFamily?: string;
}

export interface TextContentLike {
	items: (TextItemLike | { type: string })[];
	styles?: Record<string, TextStyleLike>;
}

/** Optional glyph measurer for accurate partial widths: returns the width of `text` in font units (any unit, used as a ratio). */
export type TextMeasurer = (
	text: string,
	item: TextItemLike,
	style: TextStyleLike | undefined
) => number;

/** A character range on one page (raw offsets, end exclusive). */
export interface TextRange {
	page: number;
	start: number;
	end: number;
}

export class PageText {
	readonly page: number;
	readonly items: TextItemLike[];
	readonly styles: Record<string, TextStyleLike>;
	/** Page text. */
	readonly raw: string;
	/** Raw offset where each item starts. */
	readonly itemStart: number[];
	/** Search-normalized text. */
	readonly norm: string;
	/** For each `norm` char, the raw offset it came from. Length norm.length + 1. */
	readonly normToRaw: Int32Array;
	#measure: TextMeasurer | null;

	constructor(page: number, content: TextContentLike, measure: TextMeasurer | null = null) {
		this.page = page;
		this.items = content.items.filter(
			(i): i is TextItemLike => typeof (i as TextItemLike).str === 'string'
		);
		this.styles = content.styles ?? {};
		this.#measure = measure;
		const { raw, itemStart } = buildRaw(this.items);
		this.raw = raw;
		this.itemStart = itemStart;
		const { norm, map } = normalizeWithMap(raw);
		this.norm = norm;
		this.normToRaw = map;
	}

	get length() {
		return this.raw.length;
	}

	/** Item index containing raw offset `offset` (or the item just before a separator). */
	itemAt(offset: number): number {
		const starts = this.itemStart;
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	/** Raw offset of (item, char offset within item). */
	offsetOf(item: number, char: number): number {
		return (
			(this.itemStart[item] ?? this.raw.length) +
			Math.max(0, Math.min(char, this.items[item]?.str.length ?? 0))
		);
	}

	/** Text of a raw range, cleaned for quoting (line breaks → spaces, line-end hyphens joined). */
	textOf(start: number, end: number): string {
		return cleanQuote(this.raw.slice(Math.max(0, start), Math.min(this.raw.length, end)));
	}

	/** Quads covering a raw range, one per item fragment, merged per line. */
	quadsFor(start: number, end: number): Quad[] {
		if (end <= start || !this.items.length) return [];
		const quads: Quad[] = [];
		const first = this.itemAt(start);
		const last = this.itemAt(Math.max(start, end - 1));
		for (let i = first; i <= last; i++) {
			const item = this.items[i];
			const len = item.str.length;
			if (!len) continue;
			const s = Math.max(0, start - this.itemStart[i]);
			const e = Math.min(len, end - this.itemStart[i]);
			if (e <= s) continue;
			// Skip pure whitespace fragments (they make ragged highlights).
			if (!item.str.slice(s, e).trim()) continue;
			quads.push(this.#itemQuad(item, s, e));
		}
		return mergeLineQuads(quads);
	}

	/** Bounding rect of a raw range. */
	rectFor(start: number, end: number): PdfRect | null {
		return quadsBounds(this.quadsFor(start, end));
	}

	/** Map a `norm` range to a raw range. */
	normRangeToRaw(start: number, end: number): [number, number] {
		const s = this.normToRaw[Math.max(0, Math.min(start, this.norm.length))];
		// End: the raw offset after the last matched norm char.
		const lastRaw = this.normToRaw[Math.max(0, Math.min(end - 1, this.norm.length - 1))];
		return [s, end > start ? lastRaw + 1 : s];
	}

	/** Text covered by quads (e.g. a highlight imported from another app). */
	textInQuads(quads: Quad[]): string {
		const parts: string[] = [];
		for (const q of quads) {
			const yMid = (q[1] + q[5]) / 2;
			const a = this.offsetAtPoint(Math.min(q[0], q[4]) + 0.5, yMid);
			const b = this.offsetAtPoint(Math.max(q[2], q[6]) - 0.5, yMid);
			if (a == null || b == null) continue;
			parts.push(this.textOf(Math.min(a, b), Math.max(a, b)));
		}
		return parts.join(' ').trim();
	}

	/** Raw offset of the character nearest to a PDF-space point (for hit testing). */
	offsetAtPoint(x: number, y: number): number | null {
		let best: number | null = null;
		let bestD = Infinity;
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			if (!item.str.length) continue;
			const q = this.#itemQuad(item, 0, item.str.length);
			const b = quadsBounds([q])!;
			const dx = distanceToRange(x, b[0], b[2]);
			const dy = distanceToRange(y, b[1], b[3]);
			const d = dx * dx + dy * dy * 4;
			if (d < bestD) {
				bestD = d;
				const frac = b[2] > b[0] ? (x - b[0]) / (b[2] - b[0]) : 0;
				best = this.itemStart[i] + Math.round(Math.max(0, Math.min(1, frac)) * item.str.length);
			}
		}
		return best;
	}

	#itemQuad(item: TextItemLike, s: number, e: number): Quad {
		const style = item.fontName ? this.styles[item.fontName] : undefined;
		const [a, b, c, d, tx, ty] = item.transform;
		const fontHeight = Math.hypot(c, d) || item.height || 1;
		// Unit vectors along the baseline (u) and upwards (v).
		const ul = Math.hypot(a, b) || 1;
		const u = [a / ul, b / ul];
		const vl = Math.hypot(c, d) || 1;
		const v = [c / vl, d / vl];
		const len = item.str.length;
		let x0 = (item.width * s) / len;
		let x1 = (item.width * e) / len;
		if (this.#measure && (s > 0 || e < len)) {
			const total = this.#measure(item.str, item, style);
			if (total > 0) {
				x0 = (item.width * this.#measure(item.str.slice(0, s), item, style)) / total;
				x1 = (item.width * this.#measure(item.str.slice(0, e), item, style)) / total;
			}
		}
		const ascent = style?.ascent ?? 0.8;
		const descent = style?.descent ?? -0.2;
		const top = fontHeight * Math.min(1, Math.max(0.5, ascent));
		const bottom = fontHeight * Math.max(-0.5, Math.min(0, descent));
		const p = (x: number, y: number) => [tx + u[0] * x + v[0] * y, ty + u[1] * x + v[1] * y];
		const tl = p(x0, top);
		const tr = p(x1, top);
		const bl = p(x0, bottom);
		const br = p(x1, bottom);
		return [tl[0], tl[1], tr[0], tr[1], bl[0], bl[1], br[0], br[1]];
	}
}

/** Bounding rect [x1, y1, x2, y2] of quads. */
export function quadsBounds(quads: Quad[]): PdfRect | null {
	if (!quads.length) return null;
	let x1 = Infinity;
	let y1 = Infinity;
	let x2 = -Infinity;
	let y2 = -Infinity;
	for (const q of quads) {
		for (let i = 0; i < 8; i += 2) {
			x1 = Math.min(x1, q[i]);
			x2 = Math.max(x2, q[i]);
			y1 = Math.min(y1, q[i + 1]);
			y2 = Math.max(y2, q[i + 1]);
		}
	}
	return [x1, y1, x2, y2];
}

/** Axis-aligned quad from a rect (Z order). */
export function rectToQuad([x1, y1, x2, y2]: PdfRect): Quad {
	return [x1, y2, x2, y2, x1, y1, x2, y1];
}

/** Merge horizontally adjacent, axis-aligned quads on the same line. */
export function mergeLineQuads(quads: Quad[]): Quad[] {
	const out: Quad[] = [];
	for (const q of quads) {
		const prev = out[out.length - 1];
		const axis = (x: Quad) => Math.abs(x[1] - x[3]) < 0.01 && Math.abs(x[5] - x[7]) < 0.01;
		if (prev && axis(prev) && axis(q)) {
			const sameLine =
				Math.abs(prev[5] - q[5]) < 0.35 * (prev[1] - prev[5]) &&
				Math.abs(prev[1] - q[1]) < 0.5 * (prev[1] - prev[5]);
			const gap = q[0] - prev[2];
			const h = prev[1] - prev[5];
			if (sameLine && gap > -h && gap < h * 1.5) {
				const top = Math.max(prev[1], q[1]);
				const bottom = Math.min(prev[5], q[5]);
				const left = Math.min(prev[0], q[0]);
				const right = Math.max(prev[2], q[2]);
				out[out.length - 1] = [left, top, right, top, left, bottom, right, bottom];
				continue;
			}
		}
		out.push(q);
	}
	return out;
}

/** Raw page text: items + separators. */
function buildRaw(items: TextItemLike[]) {
	let raw = '';
	const itemStart: number[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		itemStart.push(raw.length);
		raw += item.str;
		if (item.hasEOL) {
			if (!raw.endsWith('\n')) raw += '\n';
			continue;
		}
		if (!item.str) continue;
		// Compare with the next item that has text (pdf.js emits empty spacer items).
		let j = i + 1;
		while (j < items.length && !items[j].str) {
			if (items[j].hasEOL) break;
			j++;
		}
		const next = items[j];
		if (!next || !next.str) continue;
		if (/\s$/.test(item.str) || /^\s/.test(next.str)) continue;
		// Different line (baseline moved by more than half the font height) → newline.
		const h = Math.hypot(item.transform[2], item.transform[3]) || item.height || 1;
		const dy = Math.abs(next.transform[5] - item.transform[5]);
		const endX = item.transform[4] + item.width;
		const gap = next.transform[4] - endX;
		if (dy > h * 0.5) raw += gap < -h * 5 || dy > h * 1.2 ? '\n' : ' ';
		else if (gap > h * 0.15) raw += ' ';
	}
	return { raw, itemStart };
}

const LIGATURES: Record<string, string> = {
	ﬀ: 'ff',
	ﬁ: 'fi',
	ﬂ: 'fl',
	ﬃ: 'ffi',
	ﬄ: 'ffl',
	ﬅ: 'st',
	ﬆ: 'st',
	Æ: 'AE',
	æ: 'ae',
	Œ: 'OE',
	œ: 'oe',
	ß: 'ss'
};
const PUNCT: Record<string, string> = {
	'‘': "'",
	'’': "'",
	'‚': "'",
	'‛': "'",
	'“': '"',
	'”': '"',
	'„': '"',
	'‟': '"',
	'‐': '-',
	'‑': '-',
	'‒': '-',
	'–': '-',
	'—': '-',
	'―': '-',
	'−': '-',
	'…': '...',
	' ': ' ',
	' ': ' ',
	' ': ' ',
	' ': ' ',
	'­': ''
};

/**
 * Normalize text for matching, keeping a map back to the source offsets:
 * NFKD without combining marks, lower-case, ligatures and typographic
 * punctuation folded, `-\n` joins removed, whitespace collapsed to one space.
 */
export function normalizeWithMap(src: string): { norm: string; map: Int32Array } {
	const out: string[] = [];
	const map: number[] = [];
	let lastSpace = true;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		// Line-end hyphenation: "trans-\nformer" → "transformer".
		if (
			(ch === '-' || ch === '­' || ch === '‐') &&
			src[i + 1] === '\n' &&
			/\p{Ll}/u.test(src[i + 2] ?? '')
		) {
			i++;
			continue;
		}
		if (/\s/.test(ch)) {
			if (!lastSpace) {
				out.push(' ');
				map.push(i);
				lastSpace = true;
			}
			continue;
		}
		const folded = LIGATURES[ch] ?? PUNCT[ch] ?? ch;
		for (const f of folded.normalize('NFKD')) {
			if (/\p{M}/u.test(f)) continue;
			out.push(f.toLowerCase());
			map.push(i);
			lastSpace = false;
		}
	}
	map.push(src.length);
	return { norm: out.join(''), map: Int32Array.from(map) };
}

/** Normalize a query the same way as page text. */
export function normalizeQuery(q: string): string {
	return normalizeWithMap(q).norm.trim();
}

/** Clean a raw slice for display/quoting (`trim: false` keeps boundary spaces, for snippets). */
export function cleanQuote(s: string, { trim = true }: { trim?: boolean } = {}): string {
	const out = s
		.replace(/(\p{L})[-\u00ad\u2010]\n(?=\p{Ll})/gu, '$1')
		.replace(/\s*\n\s*/g, ' ')
		.replace(/[ \t]+/g, ' ');
	return trim ? out.trim() : out;
}
