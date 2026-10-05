/** Regression tests for figure / table boxes (corpus PDFs are optional: `bun fixtures/download-corpus.ts`). */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixturePath, openFixture } from '../../test/fixtures.js';
import { analyzePaper, pdfjsPaperSource, type PaperModel } from './index.js';

const analyze = async (file: string): Promise<PaperModel> =>
	analyzePaper(pdfjsPaperSource(await openFixture(file)));
const fig = (m: PaperModel, label: string) => m.figures.find((f) => f.label === label)!;
const height = (r: number[]) => r[3] - r[1];
const corpus = (id: string) => `corpus/${id}.pdf`;
const has = (file: string) => existsSync(fixturePath(file));

describe('attention.pdf figure boxes', async () => {
	const m = await analyze('attention.pdf');

	it('Table 3 includes the table body below its caption (text + rules, no images)', () => {
		const t = fig(m, 'Table 3');
		expect(t.page).toBe(9);
		// Caption sits at y≈678–720; the table runs down to y≈409.
		expect(t.rect[1]).toBeLessThan(420);
		expect(t.rect[3]).toBeGreaterThanOrEqual(t.captionRect[3]);
	});

	it('display equations span their text column, number and formula included', () => {
		const eqs = m.figures.filter((f) => f.kind === 'equation');
		expect(eqs.length).toBeGreaterThanOrEqual(3);
		for (const e of eqs) {
			expect(e.rect[0]).toBeLessThan(115);
			expect(e.rect[2]).toBeGreaterThan(500);
			expect(e.rect[2]).toBeGreaterThanOrEqual(e.captionRect[2]);
		}
	});

	it('Figure 1 keeps the labels beside the drawing ("Positional Encoding")', () => {
		const f = fig(m, 'Figure 1');
		expect(f.page).toBe(3);
		expect(f.rect[2]).toBeGreaterThan(410);
		expect(f.rect[0]).toBeLessThan(197);
	});

	it('every table box is taller than its caption', () => {
		for (const f of m.figures.filter((f) => f.kind === 'table'))
			expect(height(f.rect) - height(f.captionRect)).toBeGreaterThan(25);
	});
});

describe.skipIf(!has(corpus('1810.04805')))('BERT (ACL, tables above captions)', async () => {
	const m = has(corpus('1810.04805')) ? await analyze(corpus('1810.04805')) : (null as never);

	it('ignores "Table 6. In this table…" running text as a caption', () => {
		expect(
			m.figures
				.filter((f) => f.label === 'Table 6')
				.every((f) => !/^Table 6\.\s+In this table/.test(f.caption))
		).toBe(true);
	});

	it('Table 1 body is the grid above the caption, not the paragraphs below', () => {
		const t = fig(m, 'Table 1');
		expect(t.rect[3]).toBeGreaterThan(t.captionRect[3] + 40);
		// Boxes get 4pt of padding, not the paragraph below.
		expect(t.rect[1]).toBeGreaterThanOrEqual(t.captionRect[1] - 5);
	});
});

describe.skipIf(!has(corpus('2610.02185')))(
	'Apple template (ALL-CAPS labels, background panels)',
	async () => {
		const m = has(corpus('2610.02185')) ? await analyze(corpus('2610.02185')) : (null as never);

		it('finds "TABLE 1 …" / "FIGURE 1 …" captions without punctuation', () => {
			expect(m.figures.length).toBeGreaterThanOrEqual(12);
			expect(fig(m, 'Table 1')).toBeTruthy();
		});

		it('Table 1 stops before the next section, and Figure 1 excludes the abstract panel', () => {
			const t = fig(m, 'Table 1');
			expect(t.rect[1]).toBeGreaterThan(300); // "4 Experiments" starts below y≈300
			const f = fig(m, 'Figure 1');
			expect(f.rect[3]).toBeLessThan(470); // abstract panel spans y≈440–744
		});
	}
);

describe.skipIf(!has(corpus('2609.32993')))('captions do not swallow table rows', async () => {
	const m = has(corpus('2609.32993')) ? await analyze(corpus('2609.32993')) : (null as never);
	it('Table 3 caption ends before the numeric rows', () => {
		const t = fig(m, 'Table 3');
		expect(t.caption).not.toMatch(/\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+/);
		expect(height(t.rect)).toBeGreaterThan(height(t.captionRect) + 60);
	});
});
