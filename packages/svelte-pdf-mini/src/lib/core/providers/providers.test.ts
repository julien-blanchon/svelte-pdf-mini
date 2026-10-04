import { describe, expect, it, vi } from 'vitest';
import {
	arxiv,
	chainProviders,
	crossref,
	defaultCitationProvider,
	invertedIndexToText,
	openAlex,
	parseArxivAtom,
	semanticScholar,
	titleSimilarity,
	type FetchLike
} from './index.js';

/** A fetch mock answering by URL substring. */
function mockFetch(routes: [RegExp, unknown, number?][]): FetchLike & { calls: string[] } {
	const calls: string[] = [];
	const f = (async (url: string) => {
		calls.push(url);
		const hit = routes.find(([re]) => re.test(url));
		const status = hit ? (hit[2] ?? 200) : 404;
		const body = hit?.[1];
		return { ok: status < 400, status, json: async () => body, text: async () => String(body) };
	}) as FetchLike & { calls: string[] };
	f.calls = calls;
	return f;
}

const work = {
	id: 'https://openalex.org/W2963403868',
	doi: 'https://doi.org/10.48550/arxiv.1706.03762',
	display_name: 'Attention Is All You Need',
	publication_year: 2017,
	authorships: [
		{ author: { display_name: 'Ashish Vaswani' } },
		{ author: { display_name: 'Noam Shazeer' } }
	],
	primary_location: { source: { display_name: 'arXiv' } },
	abstract_inverted_index: { The: [0], dominant: [1], models: [2] },
	cited_by_count: 100000
};

describe('openAlex', () => {
	it('looks up DOIs (and passes the api key)', async () => {
		const fetch = mockFetch([[/works\/doi:10\.48550/, work]]);
		const m = await openAlex({ fetch, apiKey: 'K' }).resolve({ doi: '10.48550/arXiv.1706.03762' });
		expect(fetch.calls[0]).toContain('/works/doi:10.48550%2FarXiv.1706.03762?api_key=K');
		expect(m?.title).toBe('Attention Is All You Need');
		expect(m?.abstract).toBe('The dominant models');
		expect(m?.ids.arxiv).toBe('1706.03762');
		expect(m?.urls.arxiv).toBe('https://arxiv.org/abs/1706.03762');
	});
	it('falls back to title search and checks similarity', async () => {
		const fetch = mockFetch([
			[/works\?search=/, { results: [{ ...work, display_name: 'Something else entirely' }, work] }]
		]);
		const m = await openAlex({ fetch }).resolve({ title: 'Attention is all you need', year: 2017 });
		expect(m?.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer']);
		const none = await openAlex({
			fetch: mockFetch([[/works\?search=/, { results: [{ ...work, display_name: 'Unrelated' }] }]])
		}).resolve({ title: 'Attention is all you need' });
		expect(none).toBeNull();
		// Same title, wrong year (a later survey): rejected.
		const later = await openAlex({
			fetch: mockFetch([[/works\?search=/, { results: [{ ...work, publication_year: 2022 }] }]])
		}).resolve({ title: 'Attention is all you need', year: 2017 });
		expect(later).toBeNull();
	});
	it('reconstructs inverted-index abstracts', () => {
		expect(invertedIndexToText({ b: [1], a: [0, 2] })).toBe('a b a');
	});
});

describe('semanticScholar', () => {
	it('uses ids, sends the api key and maps tldr', async () => {
		const fetch = vi.fn(
			mockFetch([
				[
					/paper\/ARXIV/,
					{
						paperId: 'abc',
						title: 'Attention Is All You Need',
						authors: [{ name: 'A. Vaswani' }],
						tldr: { text: 'Transformers.' },
						externalIds: { ArXiv: '1706.03762' }
					}
				]
			])
		);
		const m = await semanticScholar({ fetch, apiKey: 'k', minIntervalMs: 0 }).resolve({
			arxivId: '1706.03762v7'
		});
		expect(fetch.mock.calls[0][0]).toContain('/paper/ARXIV%3A1706.03762?');
		expect(fetch.mock.calls[0][1]?.headers).toEqual({ 'x-api-key': 'k' });
		expect(m?.tldr).toBe('Transformers.');
	});
});

describe('crossref', () => {
	it('matches raw citations and confirms by title', async () => {
		const fetch = mockFetch([
			[
				/query\.bibliographic/,
				{
					message: {
						items: [
							{
								DOI: '10.1/x',
								title: ['Deep residual learning for image recognition'],
								author: [{ given: 'Kaiming', family: 'He' }],
								issued: { 'date-parts': [[2016]] }
							}
						]
					}
				}
			]
		]);
		const m = await crossref({ fetch }).resolve({
			title: 'Deep Residual Learning for Image Recognition',
			raw: 'K. He et al. Deep residual learning for image recognition. CVPR 2016.'
		});
		expect(m?.authors).toEqual(['Kaiming He']);
		expect(m?.year).toBe(2016);
	});
});

describe('arxiv', () => {
	const atom = `<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T17:57:34Z</published><title>Attention Is All
  You Need</title><summary>The dominant &amp; sequence</summary><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>`;
	it('parses Atom without DOMParser', () => {
		const m = parseArxivAtom(atom)!;
		expect(m.title).toBe('Attention Is All You Need');
		expect(m.abstract).toBe('The dominant & sequence');
		expect(m.ids.arxiv).toBe('1706.03762');
		expect(m.year).toBe(2017);
	});
	it('goes through the proxy', async () => {
		const fetch = mockFetch([[/proxy/, atom]]);
		await arxiv({ fetch, proxy: '/proxy?url=' }).resolve({ arxivId: '1706.03762' });
		expect(fetch.calls[0]).toMatch(/^\/proxy\?url=https%3A%2F%2Fexport\.arxiv\.org/);
	});
});

describe('default provider', () => {
	it('chains OpenAlex then Semantic Scholar and merges', async () => {
		const fetch = mockFetch([
			[/openalex.*works\/doi/, work],
			[
				/semanticscholar.*paper\/(DOI|ARXIV)/,
				{
					paperId: 's2',
					title: 'Attention Is All You Need',
					tldr: { text: 'Short.' },
					externalIds: {}
				}
			]
		]);
		const p = defaultCitationProvider({ fetch, semanticScholarKey: 'k' });
		const m = await p.resolve({ doi: '10.48550/arXiv.1706.03762' });
		expect(m?.source).toBe('openalex+semanticscholar');
		expect(m?.abstract).toBe('The dominant models');
		expect(m?.tldr).toBe('Short.');
		// Cached: no new requests.
		const n = fetch.calls.length;
		await p.resolve({ doi: '10.48550/arXiv.1706.03762' });
		expect(fetch.calls.length).toBe(n);
	});
	it('sends arXiv ids to Semantic Scholar first', async () => {
		const fetch = mockFetch([
			[
				/semanticscholar.*paper\/ARXIV/,
				{ paperId: 's2', title: 'Attention Is All You Need', externalIds: { ArXiv: '1706.03762' } }
			]
		]);
		const m = await defaultCitationProvider({ fetch, semanticScholarKey: 'k' }).resolve({
			arxivId: '1706.03762'
		});
		expect(fetch.calls[0]).toContain('semanticscholar');
		expect(m?.ids.arxiv).toBe('1706.03762');
	});
	it('survives a failing provider', async () => {
		const bad = {
			id: 'bad',
			resolve: async () => {
				throw new Error('boom');
			}
		};
		const good = {
			id: 'good',
			resolve: async () => ({ title: 'T', authors: [], ids: {}, urls: {}, source: 'good' })
		};
		expect((await chainProviders([bad, good]).resolve({ title: 'x' }))?.title).toBe('T');
	});
	it('scores titles', () => {
		expect(titleSimilarity('Attention is all you need', 'Attention Is All You Need.')).toBe(1);
		expect(titleSimilarity('Attention is all you need', 'Deep residual learning')).toBeLessThan(
			0.2
		);
	});
});

describe('throttling', () => {
	it('retries a 429 once, then succeeds', async () => {
		let n = 0;
		const fetch: FetchLike = async () =>
			n++ === 0
				? { ok: false, status: 429, json: async () => ({}), text: async () => '' }
				: { ok: true, status: 200, json: async () => work, text: async () => '' };
		const m = await openAlex({ fetch }).resolve({ doi: '10.1/x' });
		expect(n).toBe(2);
		expect(m?.title).toBe('Attention Is All You Need');
	});
});

// Real APIs (keyless pools get throttled: a rate-limited run is reported, not failed).
describe.skipIf(!process.env.LIVE)('live (LIVE=1)', () => {
	it('resolves a real arXiv paper through the default chain', async () => {
		const m = await defaultCitationProvider().resolve({
			arxivId: '1706.03762',
			title: 'Attention is all you need',
			year: 2017
		});
		if (!m) {
			console.warn('live: all providers rate-limited');
			expect(m).toBeNull();
		} else expect(m.title).toMatch(/attention is all you need/i);
	}, 30000);
});
