import type { PdfRect } from '../types.js';
import type { Quad } from '../text/text-index.js';
import { quadsBounds } from '../text/text-index.js';
import type { Annotation, AnnotationBase, Rgb } from './model.js';

export function createId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
	);
}

export function nowIso(): string {
	return new Date().toISOString();
}

/** Base fields for a new annotation. */
export function baseFields(
	init: { page: number; color: Rgb; opacity?: number } & Partial<AnnotationBase>
): Omit<AnnotationBase, 'kind' | 'rect'> {
	const t = nowIso();
	return {
		id: createId(),
		createdAt: t,
		modifiedAt: t,
		opacity: 1,
		origin: 'local',
		...init
	} as Omit<AnnotationBase, 'kind' | 'rect'>;
}

/** Grow a rect by `pad` points on every side. */
export function padRect([x1, y1, x2, y2]: PdfRect, pad: number): PdfRect {
	return [x1 - pad, y1 - pad, x2 + pad, y2 + pad];
}

export function rectFromQuads(quads: Quad[], pad = 1): PdfRect {
	return padRect(quadsBounds(quads) ?? [0, 0, 0, 0], pad);
}

export function rectFromPoints(points: [number, number][], pad = 0): PdfRect {
	let x1 = Infinity,
		y1 = Infinity,
		x2 = -Infinity,
		y2 = -Infinity;
	for (const [x, y] of points) {
		x1 = Math.min(x1, x);
		y1 = Math.min(y1, y);
		x2 = Math.max(x2, x);
		y2 = Math.max(y2, y);
	}
	return padRect([x1, y1, x2, y2], pad);
}

/** Recompute `rect` from the annotation's geometry (call after moving/resizing). */
export function withComputedRect<T extends Annotation>(a: T): T {
	switch (a.kind) {
		case 'highlight':
		case 'underline':
		case 'strikeout':
		case 'squiggly':
			return { ...a, rect: rectFromQuads(a.quads) };
		case 'ink': {
			const pts = a.paths.flatMap((p) => p.points);
			return pts.length
				? { ...a, rect: rectFromPoints(pts, a.width * (a.style === 'freehand' ? 1.8 : 1)) }
				: a;
		}
		case 'line':
		case 'arrow':
		case 'polygon':
		case 'polyline':
			return a.points?.length ? { ...a, rect: rectFromPoints(a.points, a.width * 3) } : a;
		default:
			return a;
	}
}

/** Move an annotation by (dx, dy) points. */
export function translateAnnotation<T extends Annotation>(a: T, dx: number, dy: number): T {
	const r = a.rect;
	const moved = { ...a, rect: [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy] as PdfRect };
	if ('quads' in a)
		(moved as { quads: Quad[] }).quads = a.quads.map(
			(q) => q.map((v, i) => v + (i % 2 ? dy : dx)) as Quad
		);
	if ('paths' in a)
		(moved as { paths: typeof a.paths }).paths = a.paths.map((p) => ({
			...p,
			points: p.points.map(([x, y]) => [x + dx, y + dy] as [number, number])
		}));
	if ('points' in a && a.points)
		(moved as { points: [number, number][] }).points = a.points.map(
			([x, y]) => [x + dx, y + dy] as [number, number]
		);
	return moved as T;
}
