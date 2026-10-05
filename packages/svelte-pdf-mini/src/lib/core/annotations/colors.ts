import type { Rgb } from './model.js';

export interface PaletteColor {
	key: string;
	label: string;
	/** Color stored on the annotation / written to the PDF. */
	rgb: Rgb;
	/** CSS color in light UI. */
	light: string;
	/** CSS color in dark UI (night pages). */
	dark: string;
}

const hex = (h: string): Rgb => {
	const n = parseInt(h.replace('#', ''), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Default markup palette: Scholar-like pastels, readable under multiply blending. */
export const defaultPalette: PaletteColor[] = [
	{ key: 'yellow', label: 'Yellow', rgb: hex('#ffd54a'), light: '#ffe08a', dark: '#a8892b' },
	{ key: 'green', label: 'Green', rgb: hex('#7ee0b0'), light: '#9ef0c8', dark: '#3d8a66' },
	{ key: 'blue', label: 'Blue', rgb: hex('#8fb8f5'), light: '#b4cff8', dark: '#4a6fa8' },
	{ key: 'pink', label: 'Pink', rgb: hex('#f59bb0'), light: '#f8bccb', dark: '#a8546a' },
	{ key: 'purple', label: 'Purple', rgb: hex('#c3a0f0'), light: '#d8c0f6', dark: '#7a58a8' },
	{ key: 'orange', label: 'Orange', rgb: hex('#ffb070'), light: '#ffcca0', dark: '#b06a2c' },
	{ key: 'red', label: 'Red', rgb: hex('#f06b6b'), light: '#f59a9a', dark: '#b03a3a' },
	{ key: 'gray', label: 'Gray', rgb: hex('#a8a29e'), light: '#cfcac6', dark: '#6b6560' }
];

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
	const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
	return alpha >= 1 ? `rgb(${c(r)} ${c(g)} ${c(b)})` : `rgb(${c(r)} ${c(g)} ${c(b)} / ${alpha})`;
}

export function rgbToHex([r, g, b]: Rgb): string {
	const c = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToRgb(h: string): Rgb {
	return hex(h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);
}

/** Closest palette entry for a color (to recover `paletteKey` on foreign annotations). */
export function nearestPaletteKey(
	rgb: Rgb,
	palette: PaletteColor[] = defaultPalette,
	maxDistance = 0.12
): string | undefined {
	let best: PaletteColor | undefined;
	let bestD = Infinity;
	for (const p of palette) {
		const d = Math.hypot(p.rgb[0] - rgb[0], p.rgb[1] - rgb[1], p.rgb[2] - rgb[2]);
		if (d < bestD) {
			bestD = d;
			best = p;
		}
	}
	return best && bestD <= maxDistance ? best.key : undefined;
}
