/** Crossref (https://api.crossref.org): DOIs and bibliographic matching of raw citation strings. */
import type { CitationProvider, PaperMetadata, ProviderBaseOptions } from './types.js';
import { toQuery } from './types.js';
import { getFetch, getJson, titleSimilarity, yearOk } from './util.js';

export interface CrossrefOptions extends ProviderBaseOptions {
	mailto?: string;
	baseUrl?: string;
	minSimilarity?: number;
}

interface CrossrefWork {
	DOI: string;
	title?: string[];
	author?: { given?: string; family?: string; name?: string }[];
	issued?: { 'date-parts'?: number[][] };
	'container-title'?: string[];
	abstract?: string;
	'is-referenced-by-count'?: number;
	'references-count'?: number;
	URL?: string;
	link?: { URL: string; 'content-type'?: string }[];
}

export function crossref(opts: CrossrefOptions = {}): CitationProvider {
	const base = opts.baseUrl ?? 'https://api.crossref.org';
	const mail = opts.mailto ? `&mailto=${encodeURIComponent(opts.mailto)}` : '';
	const minSim = opts.minSimilarity ?? 0.75;

	const toMeta = (w: CrossrefWork): PaperMetadata => ({
		title: w.title?.[0] ?? '',
		authors: (w.author ?? [])
			.map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' '))
			.filter(Boolean),
		year: w.issued?.['date-parts']?.[0]?.[0],
		venue: w['container-title']?.[0],
		abstract:
			w.abstract
				?.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim() || undefined,
		citationCount: w['is-referenced-by-count'],
		referenceCount: w['references-count'],
		ids: { doi: w.DOI },
		urls: {
			doi: `https://doi.org/${w.DOI}`,
			landing: w.URL,
			pdf: w.link?.find((l) => l['content-type'] === 'application/pdf')?.URL
		},
		source: 'crossref'
	});

	return {
		id: 'crossref',
		async resolve(ref, { signal } = {}) {
			const q = toQuery(ref);
			const fetch = getFetch(opts.fetch);
			if (q.doi) {
				const r = await getJson<{ message: CrossrefWork }>(
					fetch,
					`${base}/works/${encodeURIComponent(q.doi)}${mail ? `?${mail.slice(1)}` : ''}`,
					{ signal }
				);
				if (r?.message) return toMeta(r.message);
			}
			const text = q.raw ?? q.title;
			if (!text || text.length < 10) return null;
			const r = await getJson<{ message: { items: CrossrefWork[] } }>(
				fetch,
				`${base}/works?query.bibliographic=${encodeURIComponent(text)}&rows=3${mail}`,
				{ signal }
			);
			const items = r?.message?.items ?? [];
			// Crossref always returns something: confirm by title.
			const best = items.find(
				(w) =>
					q.title &&
					titleSimilarity(q.title, w.title?.[0] ?? '') >= minSim &&
					yearOk(q.year, w.issued?.['date-parts']?.[0]?.[0])
			);
			return best ? toMeta(best) : null;
		}
	};
}
