import { describe, expect, it } from 'vitest';
import { expandNumbers } from './citations.js';
import { parseReference, refAtTarget, surnameOf } from './references.js';
import { flattenSections, sectionAt } from './sections.js';
import type { Reference, Section } from './types.js';

describe('parseReference', () => {
	it('reads a numeric entry: authors, title, venue, year', () => {
		const p = parseReference(
			'[12] Ashish Vaswani, Noam Shazeer, and Illia Polosukhin. Attention is all you need. In Advances in Neural Information Processing Systems, 2017.'
		);
		expect(p.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer', 'Illia Polosukhin']);
		expect(p.surnames).toEqual(['Vaswani', 'Shazeer', 'Polosukhin']);
		expect(p.title).toBe('Attention is all you need');
		expect(p.venue).toBe('Advances in Neural Information Processing Systems');
		expect(p.year).toBe(2017);
	});

	it('reads surname-first authors with a glued year and an arXiv id', () => {
		const p = parseReference(
			'Ba, J. L., Kiros, J. R., and Hinton, G. E. (2016). Layer normalization. arXiv preprint arXiv:1607.06450.'
		);
		expect(p.authors).toEqual(['J. L. Ba', 'J. R. Kiros', 'G. E. Hinton']);
		expect(p.year).toBe(2016);
		expect(p.title).toBe('Layer normalization');
		expect(p.arxivId).toBe('1607.06450');
	});

	it('reads author-year entries with a year suffix and a DOI', () => {
		const p = parseReference(
			'Kaiming He, Xiangyu Zhang, Shaoqing Ren, and Jian Sun. 2016a. Deep residual learning for image recognition. In CVPR. doi:10.1109/CVPR.2016.90.'
		);
		expect(p.surnames).toEqual(['He', 'Zhang', 'Ren', 'Sun']);
		expect([p.year, p.yearSuffix]).toEqual([2016, 'a']);
		expect(p.title).toBe('Deep residual learning for image recognition');
		expect(p.venue).toBe('CVPR');
		expect(p.doi).toBe('10.1109/CVPR.2016.90');
	});

	it('keeps initials with their names and trims URLs', () => {
		const p = parseReference(
			'3. Y. Bengio, P. Simard, and P. Frasconi. Learning long-term dependencies is difficult. IEEE Trans. Neural Netw., 1994. https://example.org/paper.pdf.'
		);
		expect(p.authors).toEqual(['Y. Bengio', 'P. Simard', 'P. Frasconi']);
		expect(p.title).toBe('Learning long-term dependencies is difficult');
		expect(p.url).toBe('https://example.org/paper.pdf');
		expect(p.year).toBe(1994);
	});
});

describe('surnameOf', () => {
	it('takes the family name in either order, without initials or suffixes', () => {
		expect(surnameOf('Geoffrey E Hinton')).toBe('Hinton');
		expect(surnameOf('Y. Bengio')).toBe('Bengio');
		expect(surnameOf('Hinton, G.')).toBe('Hinton');
		expect(surnameOf('Martin Luther King Jr.')).toBe('King');
	});
});

describe('expandNumbers', () => {
	it('expands lists and ranges, ignoring junk and huge ranges', () => {
		expect(expandNumbers('3, 5–7')).toEqual([3, 5, 6, 7]);
		expect(expandNumbers('1;2 - 4')).toEqual([1, 2, 3, 4]);
		expect(expandNumbers('a, 9')).toEqual([9]);
		expect(expandNumbers('1-200')).toEqual([]);
		expect(expandNumbers('7-3')).toEqual([]);
	});
});

const ref = (id: string, page: number, rect: Reference['rect']) =>
	({ id, page, rect }) as Reference;

describe('refAtTarget', () => {
	const refs = [ref('a', 9, [72, 700, 300, 720]), ref('b', 9, [72, 670, 300, 695])];

	it('picks the entry under (or just below) a link target', () => {
		expect(refAtTarget(refs, { page: 9, point: [72, 690] })?.id).toBe('b');
		expect(refAtTarget(refs, { page: 9, point: [0, 722] })?.id).toBe('a');
		expect(refAtTarget(refs, { page: 3, point: [72, 690] })).toBeNull();
	});
});

const section = (s: Partial<Section> & Pick<Section, 'id' | 'level' | 'page' | 'y'>): Section => ({
	title: s.id,
	endPage: s.page,
	endY: 0,
	source: 'outline',
	children: [],
	...s
});

describe('sections', () => {
	const sub = section({ id: '2.1', level: 2, page: 3, y: 400, endPage: 4, endY: 0 });
	const tree = [
		section({ id: '1', level: 1, page: 1, y: 700, endPage: 2, endY: 600 }),
		section({ id: '2', level: 1, page: 2, y: 600, endPage: 4, endY: 0, children: [sub] })
	];

	it('flattens depth-first', () => {
		expect(flattenSections(tree).map((s) => s.id)).toEqual(['1', '2', '2.1']);
	});

	it('finds the deepest section at a position', () => {
		expect(sectionAt(tree, 1, 500)?.id).toBe('1');
		expect(sectionAt(tree, 2, 650)?.id).toBe('1');
		expect(sectionAt(tree, 2, 500)?.id).toBe('2');
		expect(sectionAt(tree, 3, 300)?.id).toBe('2.1');
		expect(sectionAt(tree, 5, 300)).toBeNull();
	});
});
