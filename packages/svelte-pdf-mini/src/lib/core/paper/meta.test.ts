import { describe, expect, it } from 'vitest';
import { AFFILIATION } from './meta.js';

describe('AFFILIATION', () => {
	it('matches affiliations and contact lines', () => {
		for (const s of [
			'Google Brain',
			'Meta AI',
			'University of Toronto',
			'Allen Institute for AI',
			'MIT CSAIL Lab',
			'jane@x.org',
			'https://x.org'
		])
			expect(AFFILIATION.test(s), s).toBe(true);
	});

	it('keeps author names that only contain those letters', () => {
		for (const s of ['Angeliki Metallinou', 'David Brainard', 'Labib Rahman', 'Corpus Smith'])
			expect(AFFILIATION.test(s), s).toBe(false);
	});
});
