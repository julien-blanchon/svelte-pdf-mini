import type { PdfPoint, PdfRect } from '../core/types.js';

/** PDF y just above a destination point (so its line stays in the preview), else `fallback`. */
export function topOfPoint(point: PdfPoint | undefined, fallback: number): number {
	return point && Number.isFinite(point[1]) ? point[1] + 6 : fallback;
}

/**
 * Page band `height` PDF points tall whose top edge is at PDF y `top` (y grows
 * upwards), clamped to the page `view`. Spans the page width unless `right` is given.
 */
export function bandBelow(view: PdfRect, top: number, height: number, right = view[2]): PdfRect {
	return [view[0], Math.max(view[1], top - height), right, Math.min(view[3], top)];
}

/** `rect` grown by `by` PDF points on every side. */
export function inflateRect([x0, y0, x1, y1]: PdfRect, by: number): PdfRect {
	return [x0 - by, y0 - by, x1 + by, y1 + by];
}
