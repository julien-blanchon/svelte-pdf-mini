/**
 * Draw a page as a "structure" minimap (like a code editor's rendered
 * characters): each text item becomes a bar, headings are darker and thicker,
 * figures are filled blocks. Cheap: no pdf.js rendering, just the text index.
 */
import type { PageText } from '../text/text-index.js';
import type { PdfRect } from '../types.js';

export interface TextDensityOptions {
	/** Canvas size in device pixels. */
	width: number;
	height: number;
	/** Page box (PDF points). */
	view: [number, number, number, number];
	figures?: PdfRect[];
	ink?: string;
	headingInk?: string;
	figureFill?: string;
}

export function drawTextDensity(
	ctx: CanvasRenderingContext2D,
	text: PageText,
	opts: TextDensityOptions
) {
	const { width: W, height: H, view } = opts;
	const [vx0, vy0, vx1, vy1] = view;
	const sx = W / (vx1 - vx0);
	const sy = H / (vy1 - vy0);
	ctx.clearRect(0, 0, W, H);
	ctx.fillStyle = opts.figureFill ?? 'rgb(100 116 139 / 0.28)';
	for (const [x1, y1, x2, y2] of opts.figures ?? [])
		ctx.fillRect((x1 - vx0) * sx, (vy1 - y2) * sy, (x2 - x1) * sx, (y2 - y1) * sy);
	const heights = text.items
		.filter((i) => i.str.trim())
		.map((i) => Math.hypot(i.transform[2], i.transform[3]));
	const median = heights.length
		? heights.toSorted((a, b) => a - b)[Math.floor(heights.length / 2)]
		: 10;
	for (const item of text.items) {
		if (!item.str.trim()) continue;
		const h = Math.hypot(item.transform[2], item.transform[3]) || median;
		const heading = h > median * 1.25;
		const x = (item.transform[4] - vx0) * sx;
		const y = (vy1 - item.transform[5]) * sy;
		const barH = Math.max(1, h * sy * (heading ? 0.75 : 0.5));
		ctx.fillStyle = heading
			? (opts.headingInk ?? 'rgb(30 41 59 / 0.9)')
			: (opts.ink ?? 'rgb(71 85 105 / 0.55)');
		ctx.fillRect(x, y - barH, Math.max(1, item.width * sx), barH);
	}
}
