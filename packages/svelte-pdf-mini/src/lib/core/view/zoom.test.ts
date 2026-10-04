import { describe, expect, it } from 'vitest';
import { capOutputScale, fitZoom, nextZoomStep, rotatedSize } from './zoom.js';

describe('zoom', () => {
	it('steps up and down', () => {
		expect(nextZoomStep(1, 1)).toBe(1.1);
		expect(nextZoomStep(1, -1)).toBe(0.9);
		expect(nextZoomStep(1.05, 1)).toBe(1.1);
		expect(nextZoomStep(5, 1)).toBe(5);
		expect(nextZoomStep(0.25, -1)).toBe(0.25);
	});

	it('fits width, height and page', () => {
		const letter = { width: 612, height: 792 };
		const available = { width: 816, height: 528 };
		expect(fitZoom('page-width', letter, available)).toBeCloseTo(1);
		expect(fitZoom('page-height', letter, available)).toBeCloseTo(0.5);
		expect(fitZoom('page-fit', letter, available)).toBeCloseTo(0.5);
		expect(fitZoom('auto', letter, { width: 4000, height: 4000 })).toBe(1.25);
	});

	it('swaps size when rotated', () => {
		expect(rotatedSize({ width: 1, height: 2 }, 90)).toEqual({ width: 2, height: 1 });
		expect(rotatedSize({ width: 1, height: 2 }, 180)).toEqual({ width: 1, height: 2 });
	});

	it('caps the canvas size', () => {
		expect(capOutputScale(100, 100, 2, 1e9)).toBe(2);
		expect(capOutputScale(4000, 4000, 2, 16e6)).toBeCloseTo(1);
	});
});
