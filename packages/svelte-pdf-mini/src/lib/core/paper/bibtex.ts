/**
 * BibTeX for a parsed reference (optionally enriched by a provider).
 */
import type { PaperMetadata } from '../providers/types.js';
import type { Reference } from './types.js';

const PROCEEDINGS_VENUE =
	/proceedings|conference|workshop|\bproc\b|neurips|icml|iclr|cvpr|acl|emnlp/i;

type EntryType = 'misc' | 'inproceedings' | 'article';

/** arXiv-only preprints are @misc; conference-like venues @inproceedings; the rest @article. */
function entryType(venue: string | undefined, arxiv: string | undefined): EntryType {
	if (arxiv && !venue) return 'misc';
	if (PROCEEDINGS_VENUE.test(venue ?? '')) return 'inproceedings';
	return 'article';
}

export function referenceToBibtex(ref: Reference, meta?: PaperMetadata | null): string {
	const p = ref.parsed;
	const authors = meta?.authors?.length ? meta.authors : p.authors;
	const year = meta?.year ?? p.year;
	const title = meta?.title ?? p.title ?? ref.raw;
	const venue = meta?.venue ?? p.venue;
	const doi = meta?.ids.doi ?? p.doi;
	const arxiv = meta?.ids.arxiv ?? p.arxivId;
	const first = (p.surnames[0] ?? authors[0]?.split(/\s+/).pop() ?? 'ref')
		.toLowerCase()
		.replace(/[^a-z]/g, '');
	const word = title.toLowerCase().match(/[a-z]{4,}/)?.[0] ?? '';
	const key = `${first}${year ?? ''}${word}`;
	const type = entryType(venue, arxiv);
	const fields: [string, string | number | undefined][] = [
		['title', `{${title}}`],
		['author', authors.join(' and ')],
		['year', year],
		[type === 'inproceedings' ? 'booktitle' : 'journal', type === 'misc' ? undefined : venue],
		['doi', doi],
		['eprint', arxiv],
		['archivePrefix', arxiv ? 'arXiv' : undefined],
		['url', meta?.urls.landing ?? meta?.urls.doi ?? p.url]
	];
	const body = fields
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => `  ${k} = {${String(v).replace(/^\{(.*)\}$/, '$1')}}`)
		.join(',\n');
	return `@${type}{${key},\n${body}\n}`;
}
