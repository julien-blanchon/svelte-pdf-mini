import type { PageViewport } from 'pdfjs-dist';
import type { PdfRect } from '../types.js';

/** Normalise a rect so x1<x2 and y1<y2. */
export function normalizeRect([a, b, c, d]: PdfRect): PdfRect {
	return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

/** Convert a PDF-space rect to viewport (CSS px) `{left, top, width, height}`. */
export function pdfRectToViewport(viewport: PageViewport, rect: PdfRect) {
	const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]);
	const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]);
	return {
		left: Math.min(x1, x2),
		top: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1)
	};
}

/** Convert a viewport (CSS px) point back to PDF space. */
export function viewportPointToPdf(viewport: PageViewport, x: number, y: number): [number, number] {
	const [px, py] = viewport.convertToPdfPoint(x, y);
	return [px, py];
}

export function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

/** Distance from `v` to the interval [lo, hi] (0 inside). */
export function distanceToRange(v: number, lo: number, hi: number): number {
	if (v < lo) return lo - v;
	if (v > hi) return v - hi;
	return 0;
}

/** A PDF-space quad (Z order TL,TR,BL,BR) as a viewport polygon (clockwise TL,TR,BR,BL). */
export function quadToViewportPoints(
	viewport: PageViewport,
	q: ArrayLike<number>
): [number, number][] {
	const p = (i: number) => viewport.convertToViewportPoint(q[i], q[i + 1]) as [number, number];
	return [p(0), p(2), p(6), p(4)];
}

/** SVG `points` attribute for a quad. */
export function quadToSvgPoints(viewport: PageViewport, q: ArrayLike<number>): string {
	return quadToViewportPoints(viewport, q)
		.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
		.join(' ');
}

/** Viewport box of a PDF rect as percentages of the page (for absolutely positioned HTML overlays). */
export function pdfRectToPercent(viewport: PageViewport, rect: PdfRect) {
	const r = pdfRectToViewport(viewport, rect);
	return {
		left: (r.left / viewport.width) * 100,
		top: (r.top / viewport.height) * 100,
		width: (r.width / viewport.width) * 100,
		height: (r.height / viewport.height) * 100
	};
}
