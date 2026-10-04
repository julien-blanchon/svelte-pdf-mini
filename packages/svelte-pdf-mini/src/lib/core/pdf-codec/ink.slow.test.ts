import { describe, expect, it } from 'vitest';
import type { InkAnnotation } from '../annotations/model.js';
import { appearanceOps } from './appearance.js';
import { exportPdf, importAnnotations } from './index.js';
import { loadAttention } from './samples.test.helper.js';

const stroke = (style: 'freehand' | 'line'): InkAnnotation => ({
	id: `ink-${style}`,
	page: 1,
	kind: 'ink',
	rect: [100, 100, 220, 180],
	color: [0.1, 0.3, 0.8],
	opacity: 1,
	width: 2,
	style,
	freehand: { thinning: 0.6 },
	paths: [
		{
			points: Array.from(
				{ length: 24 },
				(_, i) => [110 + i * 4, 140 + Math.sin(i / 3) * 25] as [number, number]
			),
			pressure: Array.from({ length: 24 }, (_, i) => 0.3 + (i % 5) / 10)
		}
	],
	createdAt: '2026-01-01T00:00:00.000Z',
	modifiedAt: '2026-01-01T00:00:00.000Z'
});

describe('freehand ink', () => {
	it('fills the pressure-sensitive outline in the appearance stream (plain ink strokes)', () => {
		expect(appearanceOps(stroke('freehand')).ops).toMatch(/ c\n?.*h\nf|h\nf/s);
		expect(appearanceOps(stroke('freehand')).ops).not.toContain(' S');
		expect(appearanceOps(stroke('line')).ops).toContain('S');
	});

	it('round-trips points, pressure and style through a PDF', async () => {
		const { bytes } = await loadAttention();
		const a = stroke('freehand');
		const out = await exportPdf(bytes, [a]);
		const { annotations } = await importAnnotations(out);
		const back = annotations.find((x) => x.id === a.id) as InkAnnotation;
		expect(back.style).toBe('freehand');
		expect(back.paths[0].pressure).toEqual(a.paths[0].pressure);
		expect(back.paths[0].points).toEqual(a.paths[0].points);
		expect(back.freehand).toEqual(a.freehand);
	});
});
