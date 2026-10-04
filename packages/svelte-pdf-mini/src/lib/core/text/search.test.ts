import { describe, expect, it } from 'vitest';
import { openFixture } from '../../test/fixtures.js';
import { compileQuery, matchSnippet, searchPageText } from './search.js';
import { PageText } from './text-index.js';

describe('search', async () => {
	const doc = await openFixture('attention.pdf');
	const page = await doc.getPage(2);
	const text = new PageText(2, await page.getTextContent());

	it('finds case- and hyphenation-insensitive matches', () => {
		const hits = searchPageText(text, 'RECURRENT');
		expect(hits.length).toBeGreaterThan(2);
		for (const h of hits) expect(text.textOf(h.start, h.end).toLowerCase()).toBe('recurrent');
	});

	it('honours caseSensitive and wholeWord', () => {
		const all = searchPageText(text, 'attention');
		const exact = searchPageText(text, 'Attention', { caseSensitive: true });
		expect(exact.length).toBeLessThan(all.length);
		expect(searchPageText(text, 'atten', { wholeWord: true })).toEqual([]);
	});

	it('builds snippets and rejects bad regexes', () => {
		const [hit] = searchPageText(text, 'self-attention');
		expect(matchSnippet(text, hit).match.toLowerCase()).toContain('self-attention');
		expect(compileQuery('(', { regex: true })).toBeNull();
	});
});
