/**
 * Pen strokes for mouse, trackpad and pen input. The smoothed center line is
 * what gets stored (the PDF's InkList), so every viewer draws the same thing.
 * Pure functions on PDF-space points; tolerances are given in screen pixels
 * (`ptPerPx` converts) so a stroke behaves the same at any zoom.
 *
 * - 'smooth': Ramer–Douglas–Peucker, then a centripetal Catmull–Rom spline
 *   through the kept points: jitter goes, corners stay sharp. The default.
 * - 'steady': exponential smoothing of the input (lags a little, very calm).
 * - 'pen': variable-width outline (perfect-freehand), like real ink.
 * - 'raw': every sample, untouched.
 */
import type { PdfPoint } from '../types.js';

export type InkSmoothing = 'smooth' | 'steady' | 'pen' | 'raw';

/** Simplification tolerance and spline flattening tolerance, in screen px. */
const SMOOTH_EPS_PX = 1.5;
const FLATTEN_TOL_PX = 0.3;
/** Exponential smoothing factor per sample (lower is calmer, laggier). */
const STEADY_ALPHA = 0.3;

/** The stored center line for `points` drawn with `method`. */
export function smoothStroke(
	points: PdfPoint[],
	method: InkSmoothing,
	ptPerPx: number
): PdfPoint[] {
	if (points.length < 3) return points;
	switch (method) {
		case 'raw':
			return points;
		case 'steady':
			return rdp(ema(points, STEADY_ALPHA), 0.25 * ptPerPx);
		case 'pen':
			return rdp(points, 0.15);
		default:
			return catmullRom(rdp(points, SMOOTH_EPS_PX * ptPerPx), FLATTEN_TOL_PX * ptPerPx);
	}
}

const dist = (a: PdfPoint, b: PdfPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: PdfPoint, b: PdfPoint, t: number): PdfPoint => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t
];

function segDist(p: PdfPoint, a: PdfPoint, b: PdfPoint) {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l2 = dx * dx + dy * dy;
	if (!l2) return dist(p, a);
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker (iterative). */
function rdp(points: PdfPoint[], eps: number): PdfPoint[] {
	if (points.length < 3) return points;
	const keep = new Uint8Array(points.length);
	keep[0] = keep[points.length - 1] = 1;
	const stack: [number, number][] = [[0, points.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let max = 0;
		let at = -1;
		for (let i = a + 1; i < b; i++) {
			const d = segDist(points[i], points[a], points[b]);
			if (d > max) [max, at] = [d, i];
		}
		if (max > eps) {
			keep[at] = 1;
			stack.push([a, at], [at, b]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

function ema(points: PdfPoint[], alpha: number): PdfPoint[] {
	let s = points[0];
	const out = [s];
	for (let i = 1; i < points.length; i++) {
		s = lerp(s, points[i], alpha);
		out.push(s);
	}
	// End on the pointer, not behind it.
	out.push(points[points.length - 1]);
	return out;
}

/** Centripetal Catmull–Rom through `points`, flattened to a polyline within `tol`. */
function catmullRom(points: PdfPoint[], tol: number): PdfPoint[] {
	const P = points.filter((p, i) => !i || dist(p, points[i - 1]) > 1e-6);
	if (P.length < 3) return P;
	const out: PdfPoint[] = [P[0]];
	for (let i = 0; i < P.length - 1; i++) {
		const p0 = P[i - 1] ?? P[i];
		const p1 = P[i];
		const p2 = P[i + 1];
		const p3 = P[i + 2] ?? P[i + 1];
		// Bézier controls of the centripetal (α = ½) segment p1 → p2 (Yuksel et al.).
		const [l01, l12, l23] = [dist(p0, p1), dist(p1, p2), dist(p2, p3)];
		const [d1, d2, d3] = [Math.sqrt(l01), Math.sqrt(l12), Math.sqrt(l23)];
		const control = (
			pa: PdfPoint,
			pb: PdfPoint,
			pc: PdfPoint,
			la: number,
			da: number
		): PdfPoint => {
			if (da < 1e-6) return lerp(pb, pc, 1 / 3);
			const k = 3 * da * (da + d2);
			const m = 2 * la + 3 * da * d2 + l12;
			return [
				(la * pc[0] - l12 * pa[0] + m * pb[0]) / k,
				(la * pc[1] - l12 * pa[1] + m * pb[1]) / k
			];
		};
		flatten(p1, control(p0, p1, p2, l01, d1), control(p3, p2, p1, l23, d3), p2, tol, out, 0);
	}
	return out;
}

/** Adaptive de Casteljau flattening of a cubic Bézier (appends its points after `a`). */
function flatten(
	a: PdfPoint,
	b: PdfPoint,
	c: PdfPoint,
	d: PdfPoint,
	tol: number,
	out: PdfPoint[],
	depth: number
) {
	if (depth > 8 || Math.max(segDist(b, a, d), segDist(c, a, d)) <= tol) {
		out.push(d);
		return;
	}
	const ab = lerp(a, b, 0.5);
	const bc = lerp(b, c, 0.5);
	const cd = lerp(c, d, 0.5);
	const abc = lerp(ab, bc, 0.5);
	const bcd = lerp(bc, cd, 0.5);
	const m = lerp(abc, bcd, 0.5);
	flatten(a, ab, abc, m, tol, out, depth + 1);
	flatten(m, bcd, cd, d, tol, out, depth + 1);
}
