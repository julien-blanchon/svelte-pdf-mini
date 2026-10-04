import type { PageSize, Rotation, ZoomMode } from '../types.js';
import { PDF_TO_CSS } from '../document/pdfjs.js';
import { clamp } from './geometry.js';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
export const ZOOM_STEPS = [
	0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5
];

export function nextZoomStep(current: number, direction: 1 | -1, steps = ZOOM_STEPS): number {
	const eps = 1e-3;
	if (direction > 0) return steps.find((s) => s > current + eps) ?? steps[steps.length - 1];
	return [...steps].reverse().find((s) => s < current - eps) ?? steps[0];
}

export function rotatedSize(size: PageSize, rotation: Rotation): PageSize {
	return rotation % 180 === 0 ? size : { width: size.height, height: size.width };
}

/**
 * Resolve a fit mode to a zoom factor.
 * `available` is the inner size of the scroll container in CSS px, minus padding.
 */
export function fitZoom(
	mode: Exclude<ZoomMode, 'manual'>,
	page: PageSize,
	available: { width: number; height: number }
): number {
	const w = page.width * PDF_TO_CSS;
	const h = page.height * PDF_TO_CSS;
	const byWidth = available.width / w;
	const byHeight = available.height / h;
	let z: number;
	switch (mode) {
		case 'page-width':
			z = byWidth;
			break;
		case 'page-height':
			z = byHeight;
			break;
		case 'page-fit':
			z = Math.min(byWidth, byHeight);
			break;
		case 'auto':
			// pdf.js behaviour: fit width for portrait, but never above 125%.
			z = page.width > page.height ? Math.min(byHeight, byWidth) : Math.min(1.25, byWidth);
			break;
	}
	return clamp(z, MIN_ZOOM, MAX_ZOOM);
}

/** Largest output scale such that the canvas stays under `maxPixels`. */
export function capOutputScale(
	cssWidth: number,
	cssHeight: number,
	dpr: number,
	maxPixels: number
) {
	const area = cssWidth * cssHeight;
	if (area * dpr * dpr <= maxPixels) return dpr;
	return Math.max(0.5, Math.sqrt(maxPixels / area));
}
