import { describe, expect, it } from 'vitest';
import { openFixture } from '../../test/fixtures.js';
import { normalizeWithMap, PageText, quadsBounds } from './text-index.js';

describe('normalizeWithMap', () => {
	it('folds case, ligatures, diacritics and line-end hyphens', () => {
		const { norm, map } = normalizeWithMap('Eﬃcient  Café trans-\nformer');
		expect(norm).toBe('efficient cafe transformer');
		expect(map.length).toBe(norm.length + 1);
		expect(map[norm.indexOf('former')]).toBe('Eﬃcient  Café trans-\n'.length);
	});
});

describe('PageText on a real paper', async () => {
	const doc = await openFixture('attention.pdf');
	const page = await doc.getPage(1);
	const text = new PageText(1, await page.getTextContent());

	it('contains the title and maps search hits to geometry', () => {
		const i = text.norm.indexOf('attention is all you need');
		expect(i).toBeGreaterThan(-1);
		const [s, e] = text.normRangeToRaw(i, i + 'attention is all you need'.length);
		expect(text.textOf(s, e)).toBe('Attention Is All You Need');
		const quads = text.quadsFor(s, e);
		expect(quads.length).toBe(1); // one merged line
		const [x1, y1, x2, y2] = quadsBounds(quads)!;
		const { width, height } = page.getViewport({ scale: 1 });
		expect(x1).toBeGreaterThan(0);
		expect(x2).toBeLessThan(width);
		expect(y2).toBeGreaterThan(height * 0.5); // near the top of the page
		expect(y2 - y1).toBeGreaterThan(8);
	});

	it('locates the character under a point', () => {
		const i = text.raw.indexOf('Abstract');
		const [x1, y1, x2, y2] = text.rectFor(i, i + 8)!;
		const off = text.offsetAtPoint((x1 + x2) / 2, (y1 + y2) / 2)!;
		expect(off).toBeGreaterThanOrEqual(i);
		expect(off).toBeLessThanOrEqual(i + 8);
	});
});
