import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../core/annotations/model.js';
import {
	movePoint,
	pdfHandle,
	rectFromPoints,
	resizeRect,
	translateAnnotation
} from './geometry.js';

describe('annotation drag geometry', () => {
	it('spans two points in any order', () => {
		expect(rectFromPoints([10, 40], [0, 20])).toEqual([0, 20, 10, 40]);
	});

	it('resizes from an edge, keeping the rect normalized', () => {
		expect(resizeRect([0, 0, 10, 10], 'e', 5, 0)).toEqual([0, 0, 15, 10]);
		expect(resizeRect([0, 0, 10, 10], 'w', 20, 0)).toEqual([10, 0, 20, 10]);
		// PDF y grows upwards: 'n' moves the top edge (y2).
		expect(resizeRect([0, 0, 10, 10], 'n', 0, 4)).toEqual([0, 0, 10, 14]);
	});

	it('keeps the ratio on corners and mirrors from the center', () => {
		expect(resizeRect([0, 0, 20, 10], 'se', 20, 0, { keepRatio: true })).toEqual([0, -10, 40, 10]);
		expect(resizeRect([0, 0, 10, 10], 'e', 5, 0, { fromCenter: true })).toEqual([-5, 0, 15, 10]);
	});

	it('moves line ends and whole annotations', () => {
		expect(
			movePoint(
				[
					[0, 0],
					[10, 10]
				],
				'p1',
				5,
				-20
			)
		).toEqual({
			points: [
				[0, 0],
				[15, -10]
			],
			rect: [0, -10, 15, 0]
		});
		const line = {
			id: 'a',
			kind: 'line',
			page: 1,
			rect: [0, 0, 10, 10],
			points: [
				[0, 0],
				[10, 10]
			],
			width: 1
		} as unknown as Annotation;
		const moved = translateAnnotation(line, 1, 2);
		expect(moved.rect).toEqual([1, 2, 11, 12]);
		expect('points' in moved && moved.points).toEqual([
			[1, 2],
			[11, 12]
		]);
	});

	it('maps screen handles to PDF edges on rotated pages', () => {
		expect(pdfHandle('n', 0)).toBe('n');
		// 90° clockwise: the screen's top is the PDF's left edge.
		expect(pdfHandle('n', 90)).toBe('w');
		expect(pdfHandle('e', 90)).toBe('n');
		expect(pdfHandle('ne', 90)).toBe('nw');
		expect(pdfHandle('n', 180)).toBe('s');
		expect(pdfHandle('se', 180)).toBe('nw');
		expect(pdfHandle('n', 270)).toBe('e');
		expect(pdfHandle('sw', 270)).toBe('nw');
	});
});
