/**
 * Graphics on a page, from its operator list (PDF space, cached per page):
 * - `images`: raster images and form XObjects (often vector figures);
 * - `rules`: thin horizontal / vertical strokes and fills (table rules, grids);
 * - `drawings`: clusters of other painted paths (TikZ / matplotlib figures
 *   drawn straight into the page content).
 * Used by figure/table detection and by the figure-preserving dark mode.
 */
import type { PDFPageProxy } from 'pdfjs-dist';
import { OPS } from './ops.js';
import type { PdfRect } from '../types.js';

type Matrix = [number, number, number, number, number, number];

export interface PageGraphics {
	images: PdfRect[];
	rules: PdfRect[];
	drawings: PdfRect[];
}

const cache = new WeakMap<PDFPageProxy, Promise<PageGraphics>>();

/** Images and form XObjects (merged when nested or overlapping). */
export async function pageImageBoxes(page: PDFPageProxy): Promise<PdfRect[]> {
	return (await pageGraphics(page)).images;
}

export function pageGraphics(page: PDFPageProxy): Promise<PageGraphics> {
	let p = cache.get(page);
	if (!p) {
		p = compute(page);
		cache.set(page, p);
	}
	return p;
}

/** Paint operators that end a path with visible output (not clip-only `endPath`). */
const PAINT = new Set<number>([
	OPS.stroke,
	OPS.closeStroke,
	OPS.fill,
	OPS.eoFill,
	OPS.fillStroke,
	OPS.eoFillStroke,
	OPS.closeFillStroke,
	OPS.closeEOFillStroke
]);

async function compute(page: PDFPageProxy): Promise<PageGraphics> {
	const ops = await page.getOperatorList();
	const [vx0, vy0, vx1, vy1] = page.view;
	const pageW = vx1 - vx0;
	const pageH = vy1 - vy0;
	const pageArea = pageW * pageH;
	const images: PdfRect[] = [];
	const rules: PdfRect[] = [];
	const paths: PdfRect[] = [];
	let ctm: Matrix = [1, 0, 0, 1, 0, 0];
	let lineWidth = 1;
	const stack: { ctm: Matrix; lineWidth: number }[] = [];
	for (let i = 0; i < ops.fnArray.length; i++) {
		const fn = ops.fnArray[i];
		const args = ops.argsArray[i] as unknown[];
		switch (fn) {
			case OPS.save:
				stack.push({ ctm, lineWidth });
				break;
			case OPS.restore: {
				const s = stack.pop();
				if (s) ({ ctm, lineWidth } = s);
				break;
			}
			case OPS.transform:
				ctm = mul(ctm, args as unknown as Matrix);
				break;
			case OPS.setLineWidth:
				lineWidth = Number(args[0]) || 0;
				break;
			case OPS.paintFormXObjectBegin: {
				stack.push({ ctm, lineWidth });
				const matrix = args[0] as Matrix | null;
				if (matrix) ctm = mul(ctm, matrix);
				const bbox = args[1] as number[] | null;
				if (bbox && bbox.length === 4) {
					const r = boxOf(ctm, bbox[0], bbox[1], bbox[2], bbox[3]);
					const area = (r[2] - r[0]) * (r[3] - r[1]);
					// Ignore tiny glyph-like forms and full-page backgrounds.
					if (area > 400 && area < pageArea * 0.9) images.push(r);
				}
				break;
			}
			case OPS.paintFormXObjectEnd: {
				const s = stack.pop();
				if (s) ({ ctm, lineWidth } = s);
				break;
			}
			case OPS.paintImageXObject:
			case OPS.paintInlineImageXObject:
			case OPS.paintImageMaskXObject:
			case OPS.paintImageXObjectRepeat: {
				const r = boxOf(ctm, 0, 0, 1, 1);
				if ((r[2] - r[0]) * (r[3] - r[1]) > 100) images.push(r);
				break;
			}
			case OPS.constructPath: {
				// pdf.js ≥ 5: [paintOp, pathData, minMax]
				const paint = args[0] as number;
				const mm = args[2] as ArrayLike<number> | null | undefined;
				if (!PAINT.has(paint) || !mm || mm.length < 4 || !Number.isFinite(mm[0])) break;
				const stroked = paint !== OPS.fill && paint !== OPS.eoFill;
				const pad = stroked ? (lineWidth * Math.hypot(ctm[0], ctm[1])) / 2 : 0;
				const r = boxOf(ctm, mm[0], mm[1], mm[2], mm[3]);
				const box: PdfRect = [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad];
				const w = box[2] - box[0];
				const h = box[3] - box[1];
				if (w * h > pageArea * 0.85) break; // page background
				if ((h <= 2.5 && w >= 15) || (w <= 2.5 && h >= 8)) rules.push(box);
				else if (w > 1 && h > 1) paths.push(box);
				break;
			}
		}
	}
	return { images: mergeOverlapping(images), rules, drawings: clusterDrawings(paths, pageArea) };
}

/** Group nearby painted paths into drawings; drop tiny isolated marks (bullets, underlines). */
function clusterDrawings(paths: PdfRect[], pageArea: number): PdfRect[] {
	if (paths.length > 6000) paths = paths.slice(0, 6000); // pathological pages
	const groups = mergeOverlapping(
		paths.map((p) => [p[0] - 4, p[1] - 4, p[2] + 4, p[3] + 4] as PdfRect)
	);
	return groups
		.map((g) => [g[0] + 4, g[1] + 4, g[2] - 4, g[3] - 4] as PdfRect)
		.filter((g) => {
			const area = (g[2] - g[0]) * (g[3] - g[1]);
			return area > 900 && area < pageArea * 0.9 && g[2] - g[0] > 20 && g[3] - g[1] > 20;
		});
}

function mul(a: Matrix, b: Matrix): Matrix {
	return [
		a[0] * b[0] + a[2] * b[1],
		a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3],
		a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4],
		a[1] * b[4] + a[3] * b[5] + a[5]
	];
}

function boxOf(m: Matrix, x1: number, y1: number, x2: number, y2: number): PdfRect {
	const pts = [
		[x1, y1],
		[x2, y1],
		[x1, y2],
		[x2, y2]
	].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Merge boxes that are nested or overlap (nested forms report several boxes). */
export function mergeOverlapping(boxes: PdfRect[]): PdfRect[] {
	// Sort by x so most merges happen between neighbours; repeat until stable.
	let out = [...boxes].sort((a, b) => a[0] - b[0]);
	let merged = true;
	while (merged) {
		merged = false;
		const next: PdfRect[] = [];
		for (const b of out) {
			let absorbed = false;
			for (let i = 0; i < next.length; i++) {
				const a = next[i];
				if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) {
					next[i] = [
						Math.min(a[0], b[0]),
						Math.min(a[1], b[1]),
						Math.max(a[2], b[2]),
						Math.max(a[3], b[3])
					];
					absorbed = true;
					merged = true;
					break;
				}
			}
			if (!absorbed) next.push(b);
		}
		out = next;
	}
	return out;
}
