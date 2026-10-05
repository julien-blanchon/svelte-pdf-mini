import { describe, expect, it } from 'vitest';
import type { PageViewport } from 'pdfjs-dist';
import type { Annotation } from './model.js';
import { hitsAnnotation, layoutLanes, quadSquiggle } from './geometry.js';

describe('layoutLanes', () => {
	it('puts overlapping intervals in separate lanes and reuses free lanes', () => {
		const { lanes, count } = layoutLanes([
			{ top: 0, bottom: 10 },
			{ top: 5, bottom: 15 },
			{ top: 12, bottom: 20 },
			{ top: 30, bottom: 40 }
		]);
		expect(lanes).toEqual([0, 1, 0, 0]);
		expect(count).toBe(2);
	});
});

describe('hitsAnnotation', () => {
	const shape = (kind: 'ellipse' | 'polygon', extra = {}) =>
		({
			id: kind,
			kind,
			page: 1,
			rect: [0, 0, 100, 50],
			width: 2,
			color: [1, 0, 0],
			createdAt: '',
			modifiedAt: '',
			...extra
		}) as unknown as Annotation;

	it('hits an outlined ellipse on its outline, not its box corners', () => {
		const e = shape('ellipse');
		expect(hitsAnnotation(e, 100, 25)).toBe(true);
		expect(hitsAnnotation(e, 50, 0)).toBe(true);
		expect(hitsAnnotation(e, 1, 1)).toBe(false);
		expect(hitsAnnotation(e, 50, 25)).toBe(false);
		expect(hitsAnnotation(shape('ellipse', { fill: [0, 0, 1] }), 50, 25)).toBe(true);
	});

	it('hits a polygon on its own edges, including the closing one', () => {
		const tri = shape('polygon', {
			points: [
				[0, 0],
				[100, 0],
				[50, 50]
			]
		});
		expect(hitsAnnotation(tri, 50, 0)).toBe(true);
		expect(hitsAnnotation(tri, 25, 25)).toBe(true);
		// Box corner, away from every edge.
		expect(hitsAnnotation(tri, 2, 48)).toBe(false);
	});
});

describe('quadSquiggle', () => {
	it('draws nothing for a zero-length quad', () => {
		const vp = {
			convertToViewportPoint: (x: number, y: number) => [x, y]
		} as unknown as PageViewport;
		expect(quadSquiggle(vp, [5, 5, 5, 5, 5, 0, 5, 0] as never)).toBe('');
	});
});
