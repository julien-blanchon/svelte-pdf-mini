/**
 * Appearance streams (/AP /N) as content-stream operators.
 *
 * Every exported annotation carries its own appearance so viewers that never
 * synthesise one (Apple Preview, many mobile readers, printing paths) draw it
 * exactly as we do. Geometry is in absolute page space: the form XObject uses
 * /BBox = /Rect and an identity /Matrix.
 *
 * Pure functions (no pdf-lib): text and images are added by the writer.
 */
import type { PdfPoint } from '../types.js';
import type { Quad } from '../text/text-index.js';
import type {
	Annotation,
	AreaAnnotation,
	InkAnnotation,
	LineEnding,
	NoteAnnotation,
	Rgb,
	ShapeAnnotation,
	TextMarkupAnnotation
} from '../annotations/model.js';
import { n } from './shared.js';
import { inkOutlines } from '../annotations/freehand.js';

/** An ExtGState entry: stroke/fill alpha and blend mode. */
export interface GraphicsState {
	CA?: number;
	ca?: number;
	BM?: 'Multiply' | 'Normal' | 'Screen';
}

export interface AppearanceOps {
	/** Content stream operators. */
	ops: string;
	/** ExtGStates referenced as /GS0, /GS1… */
	gs: Record<string, GraphicsState>;
}

const rg = ([r, g, b]: Rgb) => `${n(r)} ${n(g)} ${n(b)} rg`;
const RG = ([r, g, b]: Rgb) => `${n(r)} ${n(g)} ${n(b)} RG`;
const darken = ([r, g, b]: Rgb, k = 0.65): Rgb => [r * k, g * k, b * k];

type Pt = PdfPoint;
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const norm = (a: Pt): Pt => {
	const l = len(a) || 1;
	return [a[0] / l, a[1] / l];
};

/** Corner points of a Z-order quad. */
function corners(q: Quad): { tl: Pt; tr: Pt; bl: Pt; br: Pt } {
	return {
		tl: [q[0], q[1]],
		tr: [q[2], q[3]],
		bl: [q[4], q[5]],
		br: [q[6], q[7]]
	};
}

function quadPath(q: Quad): string {
	const { tl, tr, bl, br } = corners(q);
	return `${n(tl[0])} ${n(tl[1])} m ${n(tr[0])} ${n(tr[1])} l ${n(br[0])} ${n(br[1])} l ${n(bl[0])} ${n(bl[1])} l h`;
}

function rectPath([x1, y1, x2, y2]: number[], inset = 0): string {
	return `${n(x1 + inset)} ${n(y1 + inset)} ${n(x2 - x1 - 2 * inset)} ${n(y2 - y1 - 2 * inset)} re`;
}

/** Ellipse inscribed in a rect, as four Bézier curves. */
function ellipsePath([x1, y1, x2, y2]: number[], inset = 0): string {
	const k = 0.5522847498;
	const cx = (x1 + x2) / 2;
	const cy = (y1 + y2) / 2;
	const rx = Math.max(0, (x2 - x1) / 2 - inset);
	const ry = Math.max(0, (y2 - y1) / 2 - inset);
	const ox = rx * k;
	const oy = ry * k;
	return [
		`${n(cx - rx)} ${n(cy)} m`,
		`${n(cx - rx)} ${n(cy + oy)} ${n(cx - ox)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
		`${n(cx + ox)} ${n(cy + ry)} ${n(cx + rx)} ${n(cy + oy)} ${n(cx + rx)} ${n(cy)} c`,
		`${n(cx + rx)} ${n(cy - oy)} ${n(cx + ox)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
		`${n(cx - ox)} ${n(cy - ry)} ${n(cx - rx)} ${n(cy - oy)} ${n(cx - rx)} ${n(cy)} c h`
	].join(' ');
}

/** Smooth a polyline with Catmull-Rom → cubic Bézier (shared by ink AP). */
export function smoothPath(p: PdfPoint[]): string {
	if (!p.length) return '';
	if (p.length === 1) return `${n(p[0][0])} ${n(p[0][1])} m ${n(p[0][0] + 0.01)} ${n(p[0][1])} l`;
	let d = `${n(p[0][0])} ${n(p[0][1])} m`;
	if (p.length === 2) return `${d} ${n(p[1][0])} ${n(p[1][1])} l`;
	for (let i = 0; i < p.length - 1; i++) {
		const p0 = p[i - 1] ?? p[i];
		const p1 = p[i];
		const p2 = p[i + 1];
		const p3 = p[i + 2] ?? p2;
		const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
		const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
		d += ` ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])} c`;
	}
	return d;
}

function markupOps(a: TextMarkupAnnotation): AppearanceOps {
	const gs: Record<string, GraphicsState> = {};
	const parts: string[] = [];
	if (a.kind === 'highlight') {
		gs.GS0 = { CA: a.opacity, ca: a.opacity, BM: 'Multiply' };
		parts.push('/GS0 gs', rg(a.color));
		for (const q of a.quads) parts.push(quadPath(q), 'f');
		return { ops: parts.join('\n'), gs };
	}
	gs.GS0 = { CA: a.opacity, ca: a.opacity };
	parts.push('/GS0 gs', RG(a.color), '1 J 1 j');
	for (const q of a.quads) {
		const { tl, bl, br } = corners(q);
		const up = sub(tl, bl);
		const h = len(up) || 1;
		const u = norm(up);
		const along = sub(br, bl);
		const w = Math.max(0.5, h * 0.07);
		parts.push(`${n(w)} w`);
		if (a.kind === 'underline') {
			const o = mul(u, h * 0.08);
			const s = add(bl, o);
			const e = add(br, o);
			parts.push(`${n(s[0])} ${n(s[1])} m ${n(e[0])} ${n(e[1])} l S`);
		} else if (a.kind === 'strikeout') {
			const o = mul(u, h * 0.42);
			const s = add(bl, o);
			const e = add(br, o);
			parts.push(`${n(s[0])} ${n(s[1])} m ${n(e[0])} ${n(e[1])} l S`);
		} else {
			// Squiggly: a zig-zag along the bottom edge.
			const total = len(along);
			const dir = norm(along);
			const period = Math.max(2, h * 0.28);
			const amp = h * 0.07;
			const base = add(bl, mul(u, h * 0.06));
			const steps = Math.max(2, Math.round(total / (period / 2)));
			let d = `${n(base[0])} ${n(base[1])} m`;
			for (let i = 1; i <= steps; i++) {
				const t = (total * i) / steps;
				const off = i % 2 ? amp : -amp;
				const pt = add(add(base, mul(dir, t)), mul(u, off));
				d += ` ${n(pt[0])} ${n(pt[1])} l`;
			}
			parts.push(`${d} S`);
		}
	}
	return { ops: parts.join('\n'), gs };
}

/** A speech-bubble comment icon filling the note's rect. */
function noteOps(a: NoteAnnotation): AppearanceOps {
	const [x1, y1, x2, y2] = a.rect;
	const w = x2 - x1;
	const h = y2 - y1;
	const r = Math.min(w, h) * 0.18;
	const bx1 = x1 + 1;
	const bx2 = x2 - 1;
	const by1 = y1 + h * 0.22;
	const by2 = y2 - 1;
	const k = 0.5523 * r;
	// Rounded rectangle + tail.
	const bubble = [
		`${n(bx1 + r)} ${n(by2)} m`,
		`${n(bx2 - r)} ${n(by2)} l`,
		`${n(bx2 - r + k)} ${n(by2)} ${n(bx2)} ${n(by2 - r + k)} ${n(bx2)} ${n(by2 - r)} c`,
		`${n(bx2)} ${n(by1 + r)} l`,
		`${n(bx2)} ${n(by1 + r - k)} ${n(bx2 - r + k)} ${n(by1)} ${n(bx2 - r)} ${n(by1)} c`,
		`${n(x1 + w * 0.45)} ${n(by1)} l`,
		`${n(x1 + w * 0.25)} ${n(y1 + 1)} l`,
		`${n(x1 + w * 0.3)} ${n(by1)} l`,
		`${n(bx1 + r)} ${n(by1)} l`,
		`${n(bx1 + r - k)} ${n(by1)} ${n(bx1)} ${n(by1 + r - k)} ${n(bx1)} ${n(by1 + r)} c`,
		`${n(bx1)} ${n(by2 - r)} l`,
		`${n(bx1)} ${n(by2 - r + k)} ${n(bx1 + r - k)} ${n(by2)} ${n(bx1 + r)} ${n(by2)} c h`
	].join(' ');
	const lines: string[] = [];
	for (let i = 1; i <= 3; i++) {
		const y = by2 - ((by2 - by1) * i) / 4;
		lines.push(`${n(bx1 + w * 0.2)} ${n(y)} m ${n(bx2 - w * 0.2)} ${n(y)} l`);
	}
	return {
		ops: [
			'/GS0 gs',
			rg(a.color),
			RG(darken(a.color)),
			'0.75 w 1 j',
			bubble,
			'B',
			RG(darken(a.color, 0.45)),
			'1 J',
			...lines,
			'S'
		].join('\n'),
		gs: { GS0: { CA: a.opacity, ca: a.opacity } }
	};
}

function areaOps(a: AreaAnnotation): AppearanceOps {
	const width = a.width ?? 1.5;
	const fill = a.fill ?? a.color;
	const fillOpacity = a.fillOpacity ?? 0.12;
	return {
		ops: [
			'/GS0 gs',
			rg(fill),
			rectPath(a.rect, width / 2),
			'f',
			'/GS1 gs',
			RG(a.color),
			`${n(width)} w 0 j`,
			rectPath(a.rect, width / 2),
			'S'
		].join('\n'),
		gs: {
			GS0: { ca: fillOpacity, CA: fillOpacity, BM: 'Multiply' },
			GS1: { CA: a.opacity, ca: a.opacity }
		}
	};
}

function endingOps(
	kind: LineEnding,
	tip: Pt,
	from: Pt,
	width: number
): { stroke?: string; fill?: string } {
	if (kind === 'none' || kind === 'butt') return {};
	const dir = norm(sub(tip, from));
	const perp: Pt = [-dir[1], dir[0]];
	const s = Math.max(6, width * 4);
	const back = sub(tip, mul(dir, s));
	const l = add(back, mul(perp, s / 2));
	const r = sub(back, mul(perp, s / 2));
	switch (kind) {
		case 'open-arrow':
			return {
				stroke: `${n(l[0])} ${n(l[1])} m ${n(tip[0])} ${n(tip[1])} l ${n(r[0])} ${n(r[1])} l S`
			};
		case 'closed-arrow':
			return {
				fill: `${n(l[0])} ${n(l[1])} m ${n(tip[0])} ${n(tip[1])} l ${n(r[0])} ${n(r[1])} l h B`
			};
		case 'circle':
			return {
				fill: `${ellipsePath([tip[0] - s / 3, tip[1] - s / 3, tip[0] + s / 3, tip[1] + s / 3])} B`
			};
		case 'square':
			return {
				fill: `${rectPath([tip[0] - s / 3, tip[1] - s / 3, tip[0] + s / 3, tip[1] + s / 3])} B`
			};
		case 'diamond': {
			const t = s / 2.5;
			return {
				fill: `${n(tip[0])} ${n(tip[1] + t)} m ${n(tip[0] + t)} ${n(tip[1])} l ${n(tip[0])} ${n(tip[1] - t)} l ${n(tip[0] - t)} ${n(tip[1])} l h B`
			};
		}
	}
}

/** Default line endings for a shape kind. */
export function lineEndingsOf(a: ShapeAnnotation): [LineEnding, LineEnding] {
	return a.lineEndings ?? (a.kind === 'arrow' ? ['none', 'open-arrow'] : ['none', 'none']);
}

function shapeOps(a: ShapeAnnotation): AppearanceOps {
	const w = a.width ?? 1;
	const parts = ['/GS0 gs', RG(a.color), `${n(w)} w 1 J 1 j`];
	const gs: Record<string, GraphicsState> = { GS0: { CA: a.opacity, ca: a.opacity } };
	if (a.dash?.length) parts.push(`[${a.dash.map(n).join(' ')}] 0 d`);
	const fill = a.fill;
	const fillOp = (path: string) => {
		if (!fill) return [path, 'S'];
		gs.GS1 = { ca: a.fillOpacity ?? 1, CA: a.opacity };
		return ['/GS1 gs', rg(fill), path, 'B'];
	};
	switch (a.kind) {
		case 'rect':
			parts.push(...fillOp(rectPath(a.rect, w / 2)));
			break;
		case 'ellipse':
			parts.push(...fillOp(ellipsePath(a.rect, w / 2)));
			break;
		case 'line':
		case 'arrow': {
			const [p1, p2] = a.points ?? [];
			if (!p1 || !p2) break;
			parts.push(`${n(p1[0])} ${n(p1[1])} m ${n(p2[0])} ${n(p2[1])} l S`);
			const [le1, le2] = lineEndingsOf(a);
			parts.push(rg(a.color));
			for (const e of [endingOps(le1, p1, p2, w), endingOps(le2, p2, p1, w)]) {
				if (e.stroke) parts.push(e.stroke);
				if (e.fill) parts.push(e.fill);
			}
			break;
		}
		case 'polygon':
		case 'polyline': {
			const pts = a.points ?? [];
			if (pts.length < 2) break;
			const d = pts.map((p, i) => `${n(p[0])} ${n(p[1])} ${i ? 'l' : 'm'}`).join(' ');
			parts.push(...(a.kind === 'polygon' ? fillOp(`${d} h`) : [d, 'S']));
			break;
		}
	}
	return { ops: parts.join('\n'), gs };
}

function inkOps(a: InkAnnotation): AppearanceOps {
	// Freehand strokes: fill the pressure-sensitive outline so other viewers show the same pen look.
	const outlines = inkOutlines(a);
	if (outlines.length) {
		const parts = ['/GS0 gs', rg(a.color)];
		for (const o of outlines) {
			if (o.length < 3) continue;
			// Quadratic midpoints → cubic Béziers (PDF has no quadratic curves).
			let d = '';
			const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
			let prev = mid(o[o.length - 1], o[0]);
			d += `${n(prev[0])} ${n(prev[1])} m`;
			for (let i = 0; i < o.length; i++) {
				const c = o[i];
				const end = mid(c, o[(i + 1) % o.length]);
				const c1 = add(prev, mul(sub(c, prev), 2 / 3));
				const c2 = add(end, mul(sub(c, end), 2 / 3));
				d += ` ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(end[0])} ${n(end[1])} c`;
				prev = end;
			}
			parts.push(`${d} h`, 'f');
		}
		return { ops: parts.join('\n'), gs: { GS0: { CA: a.opacity, ca: a.opacity } } };
	}
	const parts = ['/GS0 gs', RG(a.color), `${n(a.width)} w 1 J 1 j`];
	for (const path of a.paths) {
		const d = smoothPath(path.points);
		if (d) parts.push(d, 'S');
	}
	return { ops: parts.join('\n'), gs: { GS0: { CA: a.opacity, ca: a.opacity } } };
}

/**
 * Operators for every kind except the text of free-text and stamp
 * annotations (the writer appends those, as they need an embedded font).
 */
export function appearanceOps(a: Annotation): AppearanceOps {
	switch (a.kind) {
		case 'highlight':
		case 'underline':
		case 'strikeout':
		case 'squiggly':
			return markupOps(a);
		case 'note':
			return noteOps(a);
		case 'area':
			return areaOps(a);
		case 'ink':
			return inkOps(a);
		case 'rect':
		case 'ellipse':
		case 'line':
		case 'arrow':
		case 'polygon':
		case 'polyline':
			return shapeOps(a);
		case 'freetext': {
			const parts: string[] = ['/GS0 gs'];
			if (a.fill) parts.push(rg(a.fill), rectPath(a.rect), 'f');
			parts.push(RG(a.color), '0.75 w', rectPath(a.rect, 0.375), 'S');
			return { ops: parts.join('\n'), gs: { GS0: { CA: a.opacity, ca: a.opacity } } };
		}
		case 'stamp': {
			if (a.image) return { ops: '/GS0 gs', gs: { GS0: { CA: a.opacity, ca: a.opacity } } };
			return {
				ops: ['/GS0 gs', RG(a.color), '2 w', rectPath(a.rect, 1.5), 'S'].join('\n'),
				gs: { GS0: { CA: a.opacity, ca: a.opacity } }
			};
		}
	}
}
