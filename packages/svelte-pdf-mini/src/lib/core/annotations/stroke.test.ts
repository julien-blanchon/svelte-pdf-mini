import { describe, expect, it } from 'vitest';
import type { PdfPoint } from '../types.js';
import { smoothStroke } from './stroke.js';

// A jittery mouse-like arc, one sample per pixel.
const arc: PdfPoint[] = Array.from({ length: 200 }, (_, i) => {
	const a = (i / 199) * Math.PI;
	return [
		100 + 50 * Math.cos(a) + (i % 2 ? 0.4 : -0.4),
		100 + 50 * Math.sin(a) + (i % 3 ? 0.3 : -0.3)
	];
});

describe('smoothStroke', () => {
	it('keeps raw strokes untouched', () => {
		expect(smoothStroke(arc, 'raw', 1)).toBe(arc);
	});
	it('smooth: fewer points, same ends, close to the input', () => {
		const out = smoothStroke(arc, 'smooth', 1);
		expect(out.length).toBeLessThan(arc.length);
		expect(out[0]).toEqual(arc[0]);
		expect(out.at(-1)).toEqual(arc.at(-1));
		for (const p of out) {
			const r = Math.hypot(p[0] - 100, p[1] - 100);
			expect(Math.abs(r - 50)).toBeLessThan(2.5);
		}
	});
	it('steady ends on the last sample', () => {
		expect(smoothStroke(arc, 'steady', 1).at(-1)).toEqual(arc.at(-1));
	});
});
