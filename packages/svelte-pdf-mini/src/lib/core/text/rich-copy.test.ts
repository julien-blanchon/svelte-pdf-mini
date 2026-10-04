import { describe, expect, it } from 'vitest';
import { fontStyleFromName } from './rich-copy.js';
import { referenceToBibtex } from '../paper/bibtex.js';

describe('rich copy', () => {
	it('guesses styles from font names', () => {
		expect(fontStyleFromName('ABCDEF+CMBX10')).toMatchObject({ bold: true, italic: false });
		expect(fontStyleFromName('Times-Italic')).toMatchObject({ bold: false, italic: true });
		expect(fontStyleFromName('NimbusRomNo9L-Medi')).toMatchObject({ bold: true });
		expect(fontStyleFromName('CMR10')).toMatchObject({ bold: false, italic: false });
		expect(fontStyleFromName('CMTT10').mono).toBe(true);
	});
});

describe('bibtex', () => {
	it('formats a parsed reference', () => {
		const bib = referenceToBibtex({
			id: 'r1',
			index: 1,
			label: '[1]',
			raw: '',
			page: 1,
			rect: [0, 0, 1, 1],
			quads: [],
			ranges: [],
			dests: [],
			parsed: {
				authors: ['Ashish Vaswani', 'Noam Shazeer'],
				surnames: ['Vaswani', 'Shazeer'],
				year: 2017,
				title: 'Attention is all you need',
				venue: 'Advances in Neural Information Processing Systems'
			}
		});
		expect(bib).toMatch(/^@article\{vaswani2017attention,/);
		expect(bib).toContain('author = {Ashish Vaswani and Noam Shazeer}');
	});
});
