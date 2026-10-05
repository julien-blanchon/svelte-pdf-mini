/**
 * Freehand ink (tldraw / excalidraw style): the stroke is a filled outline
 * computed by perfect-freehand from the center line and pressure, so it
 * thins, tapers and smooths like a real pen. Pure functions (PDF space in,
 * PDF space out) shared by the on-screen layer and the PDF appearance stream.
 */
import { getStroke } from 'perfect-freehand';
import type { PdfPoint } from '../types.js';
import type { FreehandOptions, InkAnnotation, InkPath } from './model.js';

export const defaultFreehand: Required<Omit<FreehandOptions, 'taperStart' | 'taperEnd'>> &
	Pick<FreehandOptions, 'taperStart' | 'taperEnd'> = {
	thinning: 0.55,
	smoothing: 0.5,
	streamline: 0.5,
	simulatePressure: true,
	taperStart: 0,
	taperEnd: 0
};

/** Outline polygon (PDF space) of one ink path. */
export function freehandOutline(
	path: InkPath,
	width: number,
	opts: FreehandOptions = {}
): PdfPoint[] {
	const o = { ...defaultFreehand, ...opts };
	const hasPressure = !!path.pressure?.length && path.pressure.some((p) => p !== 0.5);
	const input = path.points.map(([x, y], i) => [x, y, path.pressure?.[i] ?? 0.5]);
	return getStroke(input, {
		size: width * 2.2,
		thinning: o.thinning,
		smoothing: o.smoothing,
		streamline: o.streamline,
		simulatePressure: hasPressure ? false : o.simulatePressure,
		start: { taper: o.taperStart ?? 0, cap: true },
		end: { taper: o.taperEnd ?? 0, cap: true },
		last: true
	}) as PdfPoint[];
}

/** Outline polygons for every path of a freehand ink annotation (empty for 'line' style). */
export function inkOutlines(a: InkAnnotation): PdfPoint[][] {
	if ((a.style ?? 'line') !== 'freehand') return [];
	return a.paths.filter((p) => p.points.length).map((p) => freehandOutline(p, a.width, a.freehand));
}

/** Smooth closed SVG path through outline points (quadratic midpoints), given a point mapper. */
export function outlineToSvgPath(
	points: PdfPoint[],
	map: (p: PdfPoint) => [number, number] = (p) => p
): string {
	if (points.length < 3) return '';
	const pts = points.map(map);
	const f = (n: number) => n.toFixed(2);
	let d = `M${f(pts[0][0])},${f(pts[0][1])} Q`;
	for (let i = 0; i < pts.length; i++) {
		const [x0, y0] = pts[i];
		const [x1, y1] = pts[(i + 1) % pts.length];
		d += `${f(x0)},${f(y0)} ${f((x0 + x1) / 2)},${f((y0 + y1) / 2)} `;
	}
	return `${d}Z`;
}
