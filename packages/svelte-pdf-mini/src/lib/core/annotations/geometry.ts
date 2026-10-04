/**
 * Annotation geometry: hit testing in PDF space and SVG shapes in viewport
 * space (a scale-1 pdf.js viewport, so overlays scale with zoom via viewBox).
 */
import type { PageViewport } from 'pdfjs-dist';
import type { PdfPoint, PdfRect } from '../types.js';
import type { Quad } from '../text/text-index.js';
import type { Annotation, InkPath } from './model.js';

type Pt = [number, number];

// ── Hit testing (PDF space) ──────────────────────────────────────────────────

function inRect([x1, y1, x2, y2]: PdfRect, x: number, y: number, pad = 0) {
	return (
		x >= Math.min(x1, x2) - pad &&
		x <= Math.max(x1, x2) + pad &&
		y >= Math.min(y1, y2) - pad &&
		y <= Math.max(y1, y2) + pad
	);
}

function inPolygon(pts: Pt[], x: number, y: number) {
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i];
		const [xj, yj] = pts[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt) {
	const dx = bx - ax;
	const dy = by - ay;
	const t =
		dx || dy
			? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
			: 0;
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const quadPolygon = (q: Quad): Pt[] => [
	[q[0], q[1]],
	[q[2], q[3]],
	[q[6], q[7]],
	[q[4], q[5]]
];

/** Does the point (PDF space) hit the annotation? `tolerance` in points. */
export function hitsAnnotation(a: Annotation, x: number, y: number, tolerance = 3): boolean {
	if (!inRect(a.rect, x, y, tolerance + 2)) return false;
	switch (a.kind) {
		case 'highlight':
		case 'underline':
		case 'strikeout':
		case 'squiggly':
			return a.quads.some((q) => inPolygon(quadPolygon(q), x, y));
		case 'ink':
			return a.paths.some((p) =>
				p.points.some(
					(pt, i) => i > 0 && distToSegment([x, y], p.points[i - 1], pt) <= tolerance + a.width / 2
				)
			);
		case 'line':
		case 'arrow':
		case 'polyline':
			return !!a.points?.some(
				(pt, i) => i > 0 && distToSegment([x, y], a.points![i - 1], pt) <= tolerance + a.width / 2
			);
		case 'area':
		case 'rect':
		case 'ellipse':
		case 'polygon': {
			// Edges only, so text inside stays selectable; filled shapes hit anywhere.
			const [x1, y1, x2, y2] = a.rect;
			const filled = a.kind === 'area' || ('fill' in a && a.fill);
			if (filled) return true;
			const edges: Pt[] = [
				[x1, y1],
				[x2, y1],
				[x2, y2],
				[x1, y2],
				[x1, y1]
			];
			return edges.some(
				(pt, i) => i > 0 && distToSegment([x, y], edges[i - 1], pt) <= tolerance + 2
			);
		}
		default:
			return true;
	}
}

/**
 * Every annotation under a point, in priority order:
 * 1. the innermost (smallest box) first: a highlight inside a box beats the box,
 *    an inner box beats the outer one, a note icon beats the area around it;
 * 2. among equal sizes, the most recently created/listed first.
 */
export function hitStack(
	annotations: Annotation[],
	x: number,
	y: number,
	tolerance = 3
): Annotation[] {
	const area = (a: Annotation) => Math.abs((a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]));
	return annotations
		.map((a, i) => ({ a, i }))
		.filter(({ a }) => hitsAnnotation(a, x, y, tolerance))
		.sort((p, q) => area(p.a) - area(q.a) || q.i - p.i)
		.map(({ a }) => a);
}

/** The annotation that wins under a point (see `hitStack` for the rules). */
export function hitTest(
	annotations: Annotation[],
	x: number,
	y: number,
	tolerance = 3
): Annotation | null {
	return hitStack(annotations, x, y, tolerance)[0] ?? null;
}

/**
 * Lane layout for gutter bars: assigns each vertical interval [top, bottom]
 * the lowest lane not used by an overlapping interval. Returns lane per index
 * and the number of lanes.
 */
export function layoutLanes(
	intervals: { top: number; bottom: number }[],
	gap = 0
): { lanes: number[]; count: number } {
	const order = intervals
		.map((v, i) => ({ ...v, i }))
		.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
	const laneEnds: number[] = [];
	const lanes: number[] = new Array(intervals.length).fill(0);
	for (const v of order) {
		let lane = laneEnds.findIndex((end) => end + gap <= v.top);
		if (lane < 0) lane = laneEnds.push(v.bottom) - 1;
		else laneEnds[lane] = v.bottom;
		lanes[v.i] = lane;
	}
	return { lanes, count: laneEnds.length };
}

// ── SVG geometry (viewport space) ─────────────────────────────────────────────

export function toView(vp: PageViewport, [x, y]: PdfPoint): Pt {
	return vp.convertToViewportPoint(x, y) as Pt;
}

export function quadToView(vp: PageViewport, q: Quad) {
	const p = (i: number) => toView(vp, [q[i], q[i + 1]]);
	return { tl: p(0), tr: p(2), bl: p(4), br: p(6) };
}

const fmt = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Polygon points for a quad (TL, TR, BR, BL). */
export function quadPoints(vp: PageViewport, q: Quad): string {
	const { tl, tr, bl, br } = quadToView(vp, q);
	return [tl, tr, br, bl].map(fmt).join(' ');
}

/** Underline / strike-out line for a quad: `t` = 0 top … 1 bottom. */
export function quadLine(vp: PageViewport, q: Quad, t: number) {
	const { tl, tr, bl, br } = quadToView(vp, q);
	const a = lerp(tl, bl, t);
	const b = lerp(tr, br, t);
	const height = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
	return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], height };
}

/** Squiggly path along the bottom of a quad. */
export function quadSquiggle(vp: PageViewport, q: Quad): string {
	const { tl, tr, bl, br } = quadToView(vp, q);
	const height = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
	const a = lerp(tl, bl, 0.92);
	const b = lerp(tr, br, 0.92);
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const step = Math.max(1.5, height * 0.18);
	const n = Math.max(2, Math.round(len / step));
	const ux = (b[0] - a[0]) / len;
	const uy = (b[1] - a[1]) / len;
	// Normal (pointing "down" the line).
	const nx = -uy;
	const ny = ux;
	const amp = step * 0.5;
	let d = `M${fmt(a)}`;
	for (let i = 1; i <= n; i++) {
		const t = (i / n) * len;
		const s = i % 2 ? -amp : amp;
		d += ` L${fmt([a[0] + ux * t + nx * s, a[1] + uy * t + ny * s])}`;
	}
	return d;
}

/** Axis-aligned box of a PDF rect in viewport space. */
export function rectToView(vp: PageViewport, r: PdfRect) {
	const [x1, y1] = toView(vp, [r[0], r[1]]);
	const [x2, y2] = toView(vp, [r[2], r[3]]);
	return {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1)
	};
}

/** Smooth path through ink points (quadratic curves through midpoints). */
export function inkPath(vp: PageViewport, path: InkPath): string {
	const pts = path.points.map((p) => toView(vp, p));
	if (!pts.length) return '';
	if (pts.length < 3) return `M${pts.map(fmt).join(' L')}`;
	let d = `M${fmt(pts[0])}`;
	for (let i = 1; i < pts.length - 1; i++)
		d += ` Q${fmt(pts[i])} ${fmt(lerp(pts[i], pts[i + 1], 0.5))}`;
	return `${d} L${fmt(pts[pts.length - 1])}`;
}

/** Polyline path. */
export function polyPath(vp: PageViewport, points: PdfPoint[], closed = false): string {
	const pts = points.map((p) => toView(vp, p));
	return pts.length ? `M${pts.map(fmt).join(' L')}${closed ? ' Z' : ''}` : '';
}

/** Open arrow head at `to`, coming from `from` (viewport space). */
export function arrowHead(vp: PageViewport, from: PdfPoint, to: PdfPoint, size: number): string {
	const a = toView(vp, from);
	const b = toView(vp, to);
	const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
	const s = size;
	const p1: Pt = [b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45)];
	const p2: Pt = [b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)];
	return `M${fmt(p1)} L${fmt(b)} L${fmt(p2)}`;
}

/** Simplify a stroke (Ramer–Douglas–Peucker) to keep stored ink small. */
export function simplifyPoints(points: PdfPoint[], epsilon = 0.6): PdfPoint[] {
	if (points.length < 3) return points;
	let maxD = 0;
	let index = 0;
	const [a, b] = [points[0], points[points.length - 1]];
	for (let i = 1; i < points.length - 1; i++) {
		const d = distToSegment(points[i], a, b);
		if (d > maxD) {
			maxD = d;
			index = i;
		}
	}
	if (maxD <= epsilon) return [a, b];
	return [
		...simplifyPoints(points.slice(0, index + 1), epsilon).slice(0, -1),
		...simplifyPoints(points.slice(index), epsilon)
	];
}
