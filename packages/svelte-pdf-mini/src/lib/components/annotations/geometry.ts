import type { Annotation, AnnotationKind } from '../../core/annotations/model.js';
import { normalizeRect, type pdfRectToPercent } from '../../core/view/geometry.js';
import type { PdfPoint, PdfRect } from '../../core/types.js';
import type { AnnotationTool } from '../../state/annotations.svelte.js';

/** A shape being drawn, in PDF space. */
export interface Draft {
	tool: AnnotationTool;
	start: PdfPoint;
	end: PdfPoint;
	/** Ink samples, and their pen pressure. */
	points: PdfPoint[];
	pressure: number[];
	pen: boolean;
}

/** A box in percent of the page (`left`, `top`, `width`, `height`), for HTML overlays. */
export type PercentBox = ReturnType<typeof pdfRectToPercent>;

/** Resize handles of a selected box, by compass direction. */
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
/** End points of a line / arrow. */
export type PointHandle = 'p0' | 'p1';

/**
 * The PDF-space handle for a handle drawn on screen: on a page shown rotated
 * clockwise by `rotation` degrees, the screen's top edge is another PDF edge.
 */
export function pdfHandle(handle: ResizeHandle, rotation: number): ResizeHandle {
	const steps = (((Math.round(rotation / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
	if (!steps) return handle;
	const compass = ['n', 'e', 's', 'w'];
	const turned = [...handle].map((c) => compass[(compass.indexOf(c) - steps + 4) % 4]);
	// Canonical order: north/south first ('ne', not 'en').
	turned.sort((a, b) => Number('ew'.includes(a)) - Number('ew'.includes(b)));
	return turned.join('') as ResizeHandle;
}
/** What a drag on a selected annotation does. */
export type DragMode = 'move' | ResizeHandle | PointHandle;

const RESIZABLE = new Set<AnnotationKind>(['area', 'rect', 'ellipse', 'freetext', 'stamp']);

/** Kinds whose box can be resized with handles. */
export function isResizable(a: Annotation): boolean {
	return RESIZABLE.has(a.kind);
}

/** The rect spanned by two points (in any order). */
export function rectFromPoints([ax, ay]: PdfPoint, [bx, by]: PdfPoint): PdfRect {
	return normalizeRect([ax, ay, bx, by]);
}

/** The annotation moved by (dx, dy), with its points and ink paths. */
export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
	const shift = ([x, y]: PdfPoint): PdfPoint => [x + dx, y + dy];
	const [x1, y1, x2, y2] = a.rect;
	const out: Annotation = { ...a, rect: [x1 + dx, y1 + dy, x2 + dx, y2 + dy] };
	if ('points' in out && out.points) out.points = out.points.map(shift);
	if ('paths' in out) out.paths = out.paths.map((p) => ({ ...p, points: p.points.map(shift) }));
	return out;
}

/** Points of a line with end point `handle` moved by (dx, dy), and the rect they span. */
export function movePoint(
	points: PdfPoint[],
	handle: PointHandle,
	dx: number,
	dy: number
): { points: PdfPoint[]; rect: PdfRect } {
	const i = handle === 'p0' ? 0 : 1;
	const next = [...points];
	next[i] = [next[i][0] + dx, next[i][1] + dy];
	return { points: next, rect: rectFromPoints(next[0], next[1]) };
}

export interface ResizeOptions {
	/** Corners keep the proportions, anchored at the opposite corner (Shift). */
	keepRatio?: boolean;
	/** Resize from the center: the opposite edges mirror the moved ones (Alt). */
	fromCenter?: boolean;
}

/**
 * `rect` resized by dragging `handle` by (dx, dy) in PDF space (y grows upwards:
 * 'n' moves y2, 's' moves y1). Returns a normalized rect.
 */
export function resizeRect(
	rect: PdfRect,
	handle: ResizeHandle,
	dx: number,
	dy: number,
	{ keepRatio = false, fromCenter = false }: ResizeOptions = {}
): PdfRect {
	const [ox1, oy1, ox2, oy2] = rect;
	const cx = (ox1 + ox2) / 2;
	const cy = (oy1 + oy2) / 2;
	const west = handle.includes('w');
	const east = handle.includes('e');
	const south = handle.includes('s');
	const north = handle.includes('n');
	let [x1, y1, x2, y2] = rect;
	if (west) x1 += dx;
	if (east) x2 += dx;
	if (south) y1 += dy;
	if (north) y2 += dy;
	if (keepRatio && handle.length === 2) {
		const ratio = (ox2 - ox1) / Math.max(1, oy2 - oy1);
		const h = Math.abs(x2 - x1) / ratio;
		if (north) y2 = y1 + h;
		else y1 = y2 - h;
	}
	if (fromCenter) {
		if (west) x2 = 2 * cx - x1;
		if (east) x1 = 2 * cx - x2;
		if (south) y2 = 2 * cy - y1;
		if (north) y1 = 2 * cy - y2;
	}
	return normalizeRect([x1, y1, x2, y2]);
}
