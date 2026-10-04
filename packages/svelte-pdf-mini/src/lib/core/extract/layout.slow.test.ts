import { describe, expect, it } from 'vitest';
import { openFixture } from '../../test/fixtures.js';
import { analyzePaper, pdfjsPaperSource } from '../paper/index.js';
import { PageText } from '../text/text-index.js';
import { extractFromPageText } from './layout.js';

describe('layout extractor', async () => {
	const doc = await openFixture('attention.pdf');
	const model = await analyzePaper(pdfjsPaperSource(doc));
	const table1 = model.figures.find((f) => f.kind === 'table' && f.number === '1')!;
	const text = new PageText(table1.page, await (await doc.getPage(table1.page)).getTextContent());

	it('rebuilds Table 1 of Attention as a markdown table', () => {
		const r = extractFromPageText(text, { page: table1.page, rect: table1.rect, kind: 'table' })!;
		expect(r.cells!.length).toBeGreaterThanOrEqual(5);
		expect(r.cells![0].length).toBeGreaterThanOrEqual(3);
		expect(r.markdown).toMatch(/^\| .* \|\n\| --- \|/);
		expect(r.markdown).toContain('Self-Attention');
	});
});
