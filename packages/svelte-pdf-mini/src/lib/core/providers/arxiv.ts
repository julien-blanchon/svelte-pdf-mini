/**
 * arXiv API (Atom). It does not send CORS headers, so browsers need a proxy:
 * `arxiv({ proxy: (url) => `/api/proxy?url=${encodeURIComponent(url)}` })`.
 */
import type {
	CitationProvider,
	PaperMetadata,
	ProviderBaseOptions,
	ReferenceQuery
} from './types.js';
import { toQuery } from './types.js';
import {
	getFetch,
	proxied,
	ProviderError,
	searchableTitle,
	titleSimilarity,
	yearOk
} from './util.js';

export interface ArxivOptions extends ProviderBaseOptions {
	/** Rewrite the API URL (required in browsers). */
	proxy?: string | ((url: string) => string);
	minSimilarity?: number;
}

const decode = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

/** Parse the first <entry> of an arXiv Atom feed (regex: no DOMParser in workers). */
export function parseArxivAtom(xml: string): PaperMetadata | null {
	const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
	if (!entry) return null;
	const tag = (name: string) =>
		/<(?:\w+:)?NAME[^>]*>([\s\S]*?)<\/(?:\w+:)?NAME>/.source.replace(/NAME/g, name);
	const get = (name: string) => decode(new RegExp(tag(name)).exec(entry)?.[1] ?? '');
	const idUrl = get('id');
	const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(idUrl)?.[1];
	if (!id) return null;
	const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
		decode(m[1])
	);
	const doi = get('doi') || undefined;
	return {
		title: get('title'),
		authors,
		year: Number(get('published').slice(0, 4)) || undefined,
		venue: get('journal_ref') || 'arXiv',
		abstract: get('summary') || undefined,
		ids: { arxiv: id, doi },
		urls: {
			arxiv: `https://arxiv.org/abs/${id}`,
			pdf: `https://arxiv.org/pdf/${id}`,
			doi: doi ? `https://doi.org/${doi}` : undefined
		},
		source: 'arxiv'
	};
}

const ARXIV_API = 'https://export.arxiv.org/api/query?';

/** API URL: lookup by id, else a title search; null when the query has neither. */
function arxivQueryUrl(q: ReferenceQuery): string | null {
	if (q.arxivId) return `${ARXIV_API}id_list=${encodeURIComponent(q.arxivId)}`;
	const title = searchableTitle(q);
	if (!title) return null;
	const search = encodeURIComponent(`ti:"${title.replace(/"/g, '')}"`);
	return `${ARXIV_API}search_query=${search}&max_results=3`;
}

export function arxiv(opts: ArxivOptions = {}): CitationProvider {
	const minSim = opts.minSimilarity ?? 0.75;
	return {
		id: 'arxiv',
		async resolve(ref, { signal } = {}) {
			const q = toQuery(ref);
			const fetch = getFetch(opts.fetch);
			const url = arxivQueryUrl(q);
			if (!url) return null;
			const res = await fetch(proxied(opts.proxy, url), { signal });
			if (!res.ok) throw new ProviderError(`HTTP ${res.status} for ${url}`, res.status);
			const meta = parseArxivAtom(await res.text());
			if (!meta) return null;
			if (!q.arxivId && q.title && titleSimilarity(q.title, meta.title) < minSim) return null;
			if (!q.arxivId && !yearOk(q.year, meta.year)) return null;
			return meta;
		}
	};
}
