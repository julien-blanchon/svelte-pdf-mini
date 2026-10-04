/** OpenAlex (https://docs.openalex.org): free, no key, CORS-enabled. */
import type {
	CitationProvider,
	PaperMetadata,
	ProviderBaseOptions,
	ReferenceQuery
} from './types.js';
import { toQuery } from './types.js';
import { getFetch, getJson, searchableTitle, titleSimilarity, yearOk } from './util.js';

export interface OpenAlexOptions extends ProviderBaseOptions {
	/** Your email: joins OpenAlex's "polite pool". */
	mailto?: string;
	/** Free OpenAlex API key (anonymous search can be rate-limited). */
	apiKey?: string;
	baseUrl?: string;
	/** Minimum title similarity for search matches (0..1). Default 0.75. */
	minSimilarity?: number;
}

interface Work {
	id: string;
	doi?: string | null;
	display_name?: string | null;
	title?: string | null;
	publication_year?: number | null;
	authorships?: { author?: { display_name?: string } }[];
	primary_location?: {
		source?: { display_name?: string } | null;
		landing_page_url?: string | null;
	} | null;
	best_oa_location?: { pdf_url?: string | null } | null;
	open_access?: { oa_url?: string | null } | null;
	abstract_inverted_index?: Record<string, number[]> | null;
	cited_by_count?: number;
	referenced_works_count?: number;
	ids?: { doi?: string; openalex?: string };
}

/** OpenAlex stores abstracts as word → positions. */
export function invertedIndexToText(
	index: Record<string, number[]> | null | undefined
): string | undefined {
	if (!index) return undefined;
	const words: string[] = [];
	for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
	return words.filter((w) => w !== undefined).join(' ') || undefined;
}

export function openAlex(opts: OpenAlexOptions = {}): CitationProvider {
	const base = opts.baseUrl ?? 'https://api.openalex.org';
	const suffix = [
		opts.mailto && `mailto=${encodeURIComponent(opts.mailto)}`,
		opts.apiKey && `api_key=${encodeURIComponent(opts.apiKey)}`
	]
		.filter(Boolean)
		.join('&');
	const minSim = opts.minSimilarity ?? 0.75;
	const url = (path: string, params = '') =>
		`${base}${path}${params || suffix ? `?${[params, suffix].filter(Boolean).join('&')}` : ''}`;

	const toMeta = (w: Work): PaperMetadata => {
		const doi = w.doi?.replace(/^https?:\/\/doi\.org\//, '');
		const arxiv = /arxiv\.(\d{4}\.\d{4,5})/i.exec(doi ?? '')?.[1];
		return {
			title: w.display_name ?? w.title ?? '',
			authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
			year: w.publication_year ?? undefined,
			venue: w.primary_location?.source?.display_name ?? undefined,
			abstract: invertedIndexToText(w.abstract_inverted_index),
			citationCount: w.cited_by_count,
			referenceCount: w.referenced_works_count,
			ids: { doi, arxiv, openalex: w.id?.replace('https://openalex.org/', '') },
			urls: {
				doi: doi ? `https://doi.org/${doi}` : undefined,
				openalex: w.id,
				pdf: w.best_oa_location?.pdf_url ?? w.open_access?.oa_url ?? undefined,
				arxiv: arxiv ? `https://arxiv.org/abs/${arxiv}` : undefined,
				landing: w.primary_location?.landing_page_url ?? undefined
			},
			source: 'openalex'
		};
	};

	return {
		id: 'openalex',
		async resolve(ref, { signal } = {}) {
			const q: ReferenceQuery = toQuery(ref);
			const fetch = getFetch(opts.fetch);
			// 1. DOI. (OpenAlex does not index arXiv's DataCite DOIs; arXiv ids go to Semantic Scholar.)
			const doi = q.doi;
			if (doi) {
				const w = await getJson<Work>(fetch, url(`/works/doi:${encodeURIComponent(doi)}`), {
					signal
				});
				if (w) return toMeta(w);
			}
			// 2. Title search.
			const title = searchableTitle(q);
			if (!title) return null;
			const res = await getJson<{ results: Work[] }>(
				fetch,
				url('/works', `search=${encodeURIComponent(title)}&per-page=5`),
				{ signal }
			);
			let best: Work | null = null;
			let bestScore = 0;
			for (const w of res?.results ?? []) {
				let score = titleSimilarity(title, w.display_name ?? w.title ?? '');
				if (!yearOk(q.year, w.publication_year)) continue;
				if (q.year && w.publication_year) score += 0.05;
				if (score > bestScore) {
					bestScore = score;
					best = w;
				}
			}
			return best && bestScore >= minSim ? toMeta(best) : null;
		}
	};
}
