/**
 * Lines of text with their geometry, derived from `PageText`.
 * Lines follow the raw text (split on `\n`), which follows pdf.js reading order.
 */
import type { PageText, TextItemLike } from '../text/text-index.js';
import type { PdfRect } from '../types.js';

export interface Line {
	page: number;
	/** Raw offsets (end exclusive, without the `\n`). */
	start: number;
	end: number;
	text: string;
	/** Dominant font size (by characters). */
	size: number;
	/** Dominant font name. */
	font: string;
	/** Left x of the first visible item, right x of the last. */
	x: number;
	right: number;
	/** Baseline y of the first visible item. */
	y: number;
	/** Top of the line (baseline + ascent). */
	top: number;
	bottom: number;
	/** True when the line is rotated (e.g. the arXiv side stamp). */
	rotated: boolean;
}

const fontSizeOf = (it: TextItemLike) =>
	Math.hypot(it.transform[2], it.transform[3]) || it.height || 0;

export function pageLines(text: PageText): Line[] {
	const lines: Line[] = [];
	const raw = text.raw;
	let start = 0;
	while (start <= raw.length) {
		let end = raw.indexOf('\n', start);
		if (end === -1) end = raw.length;
		const line = makeLine(text, start, end);
		if (line) lines.push(line);
		start = end + 1;
	}
	return lines;
}

function makeLine(text: PageText, start: number, end: number): Line | null {
	const str = text.raw.slice(start, end);
	if (!str.trim()) return null;
	const first = text.itemAt(start);
	const last = text.itemAt(Math.max(start, end - 1));
	const sizes = new Map<number, number>();
	const fonts = new Map<string, number>();
	let x = Infinity;
	let right = -Infinity;
	let y = NaN;
	let top = -Infinity;
	let bottom = Infinity;
	let rotated = false;
	for (let i = first; i <= last; i++) {
		const it = text.items[i];
		const s = it.str.trim();
		if (!s) continue;
		const size = Math.round(fontSizeOf(it) * 10) / 10;
		sizes.set(size, (sizes.get(size) ?? 0) + s.length);
		if (it.fontName) fonts.set(it.fontName, (fonts.get(it.fontName) ?? 0) + s.length);
		const [a, b] = it.transform;
		if (Math.abs(b) > Math.abs(a)) rotated = true;
		const style = it.fontName ? text.styles[it.fontName] : undefined;
		const tx = it.transform[4];
		const ty = it.transform[5];
		x = Math.min(x, tx);
		right = Math.max(right, tx + it.width);
		if (Number.isNaN(y)) y = ty;
		top = Math.max(top, ty + size * (style?.ascent ?? 0.8));
		bottom = Math.min(bottom, ty + size * (style?.descent ?? -0.2));
	}
	if (!Number.isFinite(x)) return null;
	return {
		page: text.page,
		start,
		end,
		text: str,
		size: argmax(sizes) ?? 0,
		font: argmax(fonts) ?? '',
		x,
		right,
		y,
		top,
		bottom,
		rotated
	};
}

function argmax<K>(m: Map<K, number>): K | undefined {
	let best: K | undefined;
	let bestV = -1;
	for (const [k, v] of m) {
		if (v <= bestV) continue;
		best = k;
		bestV = v;
	}
	return best;
}

export function lineRect(l: Line): PdfRect {
	return [l.x, l.bottom, l.right, l.top];
}

/** Weighted median font size of body text (by characters, ignoring rotated lines). */
export function bodyFontSize(allLines: Line[]): number {
	const counts = new Map<number, number>();
	for (const l of allLines)
		if (!l.rotated) counts.set(l.size, (counts.get(l.size) ?? 0) + l.text.length);
	return argmax(counts) ?? 10;
}

/** Dominant body font name. */
export function bodyFont(allLines: Line[], size: number): string {
	const counts = new Map<string, number>();
	for (const l of allLines)
		if (!l.rotated && Math.abs(l.size - size) < 0.6)
			counts.set(l.font, (counts.get(l.font) ?? 0) + l.text.length);
	return argmax(counts) ?? '';
}

/** Union of rects. */
export function unionRect(rects: PdfRect[]): PdfRect | null {
	if (!rects.length) return null;
	let [x1, y1, x2, y2] = rects[0];
	for (const r of rects) {
		x1 = Math.min(x1, r[0]);
		y1 = Math.min(y1, r[1]);
		x2 = Math.max(x2, r[2]);
		y2 = Math.max(y2, r[3]);
	}
	return [x1, y1, x2, y2];
}

/** Approximate relative glyph advance (proportional fonts), for positions inside an item. */
function glyphWeight(ch: string): number {
	if (ch === ' ') return 0.27;
	if (/[iljtfr.,;:'!|()[\]]/.test(ch)) return 0.32;
	if (/[I1]/.test(ch)) return 0.4;
	if (/[mw]/.test(ch)) return 0.8;
	if (/[MW]/.test(ch)) return 0.92;
	if (/\p{Lu}/u.test(ch)) return 0.7;
	return 0.52;
}

/** x offsets (start of each char + end) of an item, using glyph weights. */
function charEdges(str: string, width: number): number[] {
	const w = [...str].map(glyphWeight);
	const total = w.reduce((a, b) => a + b, 0) || 1;
	const edges = [0];
	let acc = 0;
	for (const v of w) edges.push(((acc += v) / total) * width);
	return edges;
}

/**
 * Raw [start, end) of the tokens covered by `rect` (link → text). Works on
 * tokens (words, numbers, single punctuation) so a slightly misplaced estimate
 * never yields half words.
 */
export function rangeInRect(text: PageText, rect: PdfRect, slack = 0.5): [number, number] | null {
	const rx1 = Math.min(rect[0], rect[2]) - slack;
	const rx2 = Math.max(rect[0], rect[2]) + slack;
	const ry1 = Math.min(rect[1], rect[3]) - slack;
	const ry2 = Math.max(rect[1], rect[3]) + slack;
	let start = -1;
	let end = -1;
	let best: [number, number, number] | null = null;
	for (let i = 0; i < text.items.length; i++) {
		const it = text.items[i];
		const n = it.str.length;
		if (!n) continue;
		const [a, b] = it.transform;
		if (Math.abs(b) > Math.abs(a)) continue;
		const size = fontSizeOf(it);
		const cy = it.transform[5] + size * 0.3;
		if (cy < ry1 || cy > ry2) continue;
		const x0 = it.transform[4];
		if (x0 + it.width < rx1 || x0 > rx2) continue;
		const edges = charEdges(it.str, it.width);
		for (const m of it.str.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)) {
			const ts = m.index;
			const te = ts + m[0].length;
			const tx1 = x0 + edges[ts];
			const tx2 = x0 + edges[te];
			const overlap =
				Math.max(0, Math.min(tx2, rx2) - Math.max(tx1, rx1)) / Math.max(0.1, tx2 - tx1);
			const off = text.itemStart[i];
			if (!best || overlap > best[2]) best = [off + ts, off + te, overlap];
			if (overlap < 0.45) continue;
			if (start === -1 || off + ts < start) start = off + ts;
			if (off + te > end) end = off + te;
		}
	}
	if (start === -1) {
		if (!best || best[2] <= 0.15) return null;
		[start, end] = best;
	}
	return snapToWord(text.raw, start, end);
}

/** A range of only punctuation (estimate drifted by a glyph): move it onto the adjacent word/number. */
function snapToWord(raw: string, start: number, end: number): [number, number] {
	if (/[\p{L}\p{N}]/u.test(raw.slice(start, end))) return [start, end];
	const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
	if (isWord(raw[start - 1])) {
		let s = start - 1;
		while (isWord(raw[s - 1])) s--;
		return [s, end];
	}
	if (isWord(raw[end])) {
		let e = end + 1;
		while (isWord(raw[e])) e++;
		return [start, e];
	}
	return [start, end];
}
