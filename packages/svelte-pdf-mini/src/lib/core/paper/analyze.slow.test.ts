import { describe, expect, it } from 'vitest';
import { openFixture } from '../../test/fixtures.js';
import {
	analyzePaper,
	flattenSections,
	parseReference,
	pdfjsPaperSource,
	sectionAt,
	type PaperModel
} from './index.js';

async function analyze(file: string): Promise<PaperModel> {
	return analyzePaper(pdfjsPaperSource(await openFixture(file)));
}

const titles = (m: PaperModel) => flattenSections(m.sections).map((s) => s.title);
const refIds = (m: PaperModel) => new Set(m.references.map((r) => r.id));

describe('attention.pdf (hyperref, numeric)', async () => {
	const m = await analyze('attention.pdf');

	it('extracts metadata', () => {
		expect(m.meta.title).toBe('Attention Is All You Need');
		expect(m.meta.authors).toContain('Ashish Vaswani');
		expect(m.meta.arxivId).toBe('1706.03762');
		expect(m.meta.abstract).toMatch(/^The dominant sequence transduction models/);
	});

	it('builds the section tree from the outline, with numbers', () => {
		expect(titles(m)).toEqual(
			expect.arrayContaining([
				'Abstract',
				'Introduction',
				'Background',
				'Model Architecture',
				'References'
			])
		);
		const model = flattenSections(m.sections).find((s) => s.title === 'Model Architecture')!;
		expect(model.number).toBe('3');
		expect(model.children.map((c) => c.number)).toEqual(['3.1', '3.2', '3.3', '3.4', '3.5']);
		expect(sectionAt(m.sections, 4, 400)?.number).toMatch(/^3\.2/);
	});

	it('parses the bibliography', () => {
		expect(m.citationStyle).toBe('numeric');
		expect(m.references.length).toBe(40);
		const first = m.references[0];
		expect(first.label).toBe('[1]');
		expect(first.parsed.authors).toEqual(['Jimmy Lei Ba', 'Jamie Ryan Kiros', 'Geoffrey E Hinton']);
		expect(first.parsed.title).toBe('Layer normalization');
		expect(first.parsed.year).toBe(2016);
		expect(first.parsed.arxivId).toBe('1607.06450');
		expect(first.dests.length).toBeGreaterThan(0);
	});

	it('links in-text citations to existing references', () => {
		const p2 = m.citations.filter((c) => c.page === 2);
		expect(p2.length).toBeGreaterThan(10);
		const ids = refIds(m);
		for (const c of m.citations) {
			expect(c.referenceIds.length).toBeGreaterThan(0);
			for (const id of c.referenceIds) expect(ids.has(id)).toBe(true);
			expect(c.text).toMatch(/^\[[^\]]+\]$/);
		}
		const group = m.citations.find((c) => c.text === '[35, 2, 5]')!;
		expect(group.referenceIds.map((id) => m.references.find((r) => r.id === id)!.key)).toEqual([
			'35',
			'2',
			'5'
		]);
	});

	it('finds Figure 1 with a plausible box', () => {
		const f = m.figures.find((x) => x.label === 'Figure 1')!;
		expect(f.page).toBe(3);
		expect(f.caption).toMatch(/^Figure 1: The Transformer - model architecture/);
		const [x1, y1, x2, y2] = f.rect;
		expect(y2 - y1).toBeGreaterThan(200); // the diagram, not just the caption
		expect(x1).toBeGreaterThan(100);
		expect(x2).toBeLessThan(520);
		expect(f.dest).toBe('figure.1');
	});

	it('resolves cross-references', () => {
		const fig = m.crossRefs.find((x) => x.text === 'Figure 1');
		expect(fig?.targetId).toBe('figure-1');
		expect(m.links.filter((l) => l.kind === 'citation').length).toBeGreaterThan(50);
	});
});

describe('resnet.pdf (two columns, numeric)', async () => {
	const m = await analyze('resnet.pdf');
	it('has sections in reading order and a bounded bibliography', () => {
		expect(titles(m).slice(0, 4)).toEqual([
			'Abstract',
			'Introduction',
			'Related Work',
			'Deep Residual Learning'
		]);
		const sub = flattenSections(m.sections)
			.filter((s) => s.number?.startsWith('3.'))
			.map((s) => s.number);
		expect(sub).toEqual(['3.1', '3.2', '3.3', '3.4']);
		expect(m.references.length).toBe(50);
		expect(m.references.at(-1)!.raw).toMatch(/^\[50\] M\. D\. Zeiler/);
	});
	it('maps numeric citations across columns', () => {
		const c = m.citations.find((x) => x.text === '[41]')!;
		expect(m.references.find((r) => r.id === c.referenceIds[0])!.key).toBe('41');
		expect(new Set(m.citations.flatMap((x) => x.referenceIds)).size).toBe(50);
	});
});

describe('gpt3.pdf (alpha keys, 75 pages)', async () => {
	const t0 = performance.now();
	const m = await analyze('gpt3.pdf');
	const ms = performance.now() - t0;
	it('is fast', () => expect(ms).toBeLessThan(5000));
	it('parses alpha keys and their citations', () => {
		expect(m.citationStyle).toBe('alpha');
		expect(m.references.length).toBeGreaterThan(130);
		expect(m.references[0].key).toBe('ADG+16');
		const c = m.citations.find((x) => x.text.startsWith('[MCCD13'))!;
		expect(c.referenceIds.map((id) => m.references.find((r) => r.id === id)!.key)).toEqual([
			'MCCD13',
			'PSM14'
		]);
	});
	it('finds numbered figures like "Figure 1.2"', () => {
		expect(m.figures.find((f) => f.label === 'Figure 1.2')?.page).toBe(4);
		expect(m.figures.some((f) => /illustrates/.test(f.caption))).toBe(false);
	});
});

describe('2601.05637.pdf (natbib author-year)', async () => {
	const m = await analyze('2601.05637.pdf');
	it('detects author-year style and resolves linked citations', () => {
		expect(m.citationStyle).toBe('author-year');
		expect(m.references[0].label).toBe('Alanwar et al., 2021');
		const c = m.citations.find((x) => x.text.startsWith('(Marvin'))!;
		expect(m.references.find((r) => r.id === c.referenceIds[0])!.label).toBe('Marvin et al., 2023');
		for (const x of m.citations) expect(x.text).toMatch(/\d{4}/);
	});
	it('finds colon-less captions and an abstract without a heading', () => {
		expect(m.figures.find((f) => f.label === 'Figure 1')?.caption).toMatch(
			/^Figure 1 Dialogue Process/
		);
		expect(m.meta.abstract).toMatch(/^As generative models become ubiquitous/);
	});
});

describe('maldacena.pdf (1997 TeX, no outline, unnamed links)', async () => {
	const m = await analyze('maldacena.pdf');
	it('falls back to text headings', () => {
		const flat = flattenSections(m.sections);
		expect(flat.every((s) => s.source === 'text')).toBe(true);
		expect(flat.some((s) => s.number === '1' && /General idea/.test(s.title))).toBe(true);
		expect(flat.find((s) => s.kind === 'references')).toBeTruthy();
	});
	it('maps citations from unnamed links and physics-style references', () => {
		expect(m.references.length).toBe(65);
		expect(m.references[0].parsed.surnames).toEqual(['Maldacena', 'Strominger']);
		const group = m.citations.find((c) => c.text === '[7,8,9,10,11,12,13]')!;
		expect(group.referenceIds.length).toBe(7);
		expect(m.citations.find((c) => c.text === '[5,6]')).toBeTruthy();
	});
});

describe('parseReference', () => {
	it('handles surname-first and author-year layouts', () => {
		const a = parseReference(
			'Bengio, Y., Simard, P., and Frasconi, P. (1994). Learning long-term dependencies. IEEE Trans. Neural Netw.'
		);
		expect(a.surnames).toEqual(['Bengio', 'Simard', 'Frasconi']);
		expect(a.year).toBe(1994);
		expect(a.title).toBe('Learning long-term dependencies');
		const b = parseReference(
			'Ashish Vaswani, Noam Shazeer, et al. 2017. Attention is all you need. In NeurIPS.'
		);
		expect(b.surnames).toEqual(['Vaswani', 'Shazeer']);
		expect(b.year).toBe(2017);
		expect(b.title).toBe('Attention is all you need');
		expect(b.venue).toBe('NeurIPS');
	});
});
