/** Semantic Scholar Graph API (https://api.semanticscholar.org): CORS-enabled; ~1 req/s without a key. */
import type {
	CitationProvider,
	PaperMetadata,
	ProviderBaseOptions,
	ReferenceQuery
} from './types.js';
import { toQuery } from './types.js';
import {
	getFetch,
	getJson,
	rateLimiter,
	searchableTitle,
	titleSimilarity,
	yearOk
} from './util.js';

export interface SemanticScholarOptions extends ProviderBaseOptions {
	apiKey?: string;
	baseUrl?: string;
	/** Minimum spacing between requests. Default 1100 ms without a key, 120 ms with one. */
	minIntervalMs?: number;
	minSimilarity?: number;
}

const FIELDS =
	'title,authors,year,venue,abstract,tldr,citationCount,referenceCount,externalIds,url,openAccessPdf';

/** Graph API paper id for a DOI or (version-less) arXiv id, if the query has one. */
function s2ExternalId(q: ReferenceQuery): string | null {
	if (q.doi) return `DOI:${q.doi}`;
	if (q.arxivId) return `ARXIV:${q.arxivId.replace(/v\d+$/, '')}`;
	return null;
}

interface S2Paper {
	paperId: string;
	title?: string;
	authors?: { name: string }[];
	year?: number | null;
	venue?: string | null;
	abstract?: string | null;
	tldr?: { text?: string } | null;
	citationCount?: number;
	referenceCount?: number;
	externalIds?: { DOI?: string; ArXiv?: string } | null;
	url?: string;
	openAccessPdf?: { url?: string } | null;
}

export function semanticScholar(opts: SemanticScholarOptions = {}): CitationProvider {
	const base = opts.baseUrl ?? 'https://api.semanticscholar.org/graph/v1';
	const wait = rateLimiter(opts.minIntervalMs ?? (opts.apiKey ? 120 : 1100));
	const headers = opts.apiKey ? { 'x-api-key': opts.apiKey } : undefined;
	const minSim = opts.minSimilarity ?? 0.75;

	const toMeta = (p: S2Paper): PaperMetadata => {
		const doi = p.externalIds?.DOI;
		const arxiv = p.externalIds?.ArXiv;
		return {
			title: p.title ?? '',
			authors: (p.authors ?? []).map((a) => a.name),
			year: p.year ?? undefined,
			venue: p.venue || undefined,
			abstract: p.abstract ?? undefined,
			tldr: p.tldr?.text ?? undefined,
			citationCount: p.citationCount,
			referenceCount: p.referenceCount,
			ids: { doi, arxiv, s2: p.paperId },
			urls: {
				s2: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
				doi: doi ? `https://doi.org/${doi}` : undefined,
				arxiv: arxiv ? `https://arxiv.org/abs/${arxiv}` : undefined,
				pdf: p.openAccessPdf?.url || undefined
			},
			source: 'semanticscholar'
		};
	};

	return {
		id: 'semanticscholar',
		async resolve(ref, { signal } = {}) {
			const q = toQuery(ref);
			const fetch = getFetch(opts.fetch);
			const id = s2ExternalId(q);
			if (id) {
				await wait(signal);
				const p = await getJson<S2Paper>(
					fetch,
					`${base}/paper/${encodeURIComponent(id)}?fields=${FIELDS}`,
					{ headers, signal }
				);
				if (p) return toMeta(p);
			}
			const title = searchableTitle(q);
			if (!title) return null;
			await wait(signal);
			const res = await getJson<{ data: S2Paper[] }>(
				fetch,
				`${base}/paper/search/match?query=${encodeURIComponent(title)}&fields=${FIELDS}`,
				{ headers, signal }
			);
			const p = res?.data?.[0];
			if (!p) return null;
			const matches = titleSimilarity(title, p.title ?? '') >= minSim && yearOk(q.year, p.year);
			return matches ? toMeta(p) : null;
		}
	};
}
