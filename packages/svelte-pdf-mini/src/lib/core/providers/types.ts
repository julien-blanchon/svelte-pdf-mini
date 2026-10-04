import type { Reference } from '../paper/types.js';

/** What a provider is asked about (a parsed bibliography entry, or explicit ids). */
export interface ReferenceQuery {
	title?: string;
	doi?: string;
	arxivId?: string;
	authors?: string[];
	year?: number;
	/** The raw entry text (Crossref can match it directly). */
	raw?: string;
}

export interface PaperMetadata {
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	abstract?: string;
	/** Semantic Scholar one-sentence summary. */
	tldr?: string;
	citationCount?: number;
	referenceCount?: number;
	ids: { doi?: string; arxiv?: string; s2?: string; openalex?: string };
	urls: {
		pdf?: string;
		doi?: string;
		arxiv?: string;
		s2?: string;
		openalex?: string;
		landing?: string;
	};
	/** Provider(s) the data came from, e.g. "openalex" or "openalex+semanticscholar". */
	source: string;
}

export interface ResolveOptions {
	signal?: AbortSignal;
}

export interface CitationProvider {
	id: string;
	resolve(ref: Reference | ReferenceQuery, opts?: ResolveOptions): Promise<PaperMetadata | null>;
}

export type FetchLike = (
	input: string,
	init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{
	ok: boolean;
	status: number;
	headers?: { get(name: string): string | null };
	json(): Promise<unknown>;
	text(): Promise<string>;
}>;

export interface ProviderBaseOptions {
	/** Injected fetch (tests, proxies, auth). Defaults to globalThis.fetch. */
	fetch?: FetchLike;
}

/** Normalise a Reference or query into a query. */
export function toQuery(ref: Reference | ReferenceQuery): ReferenceQuery {
	if ('parsed' in ref) {
		const p = ref.parsed;
		return {
			title: p.title,
			doi: p.doi,
			arxivId: p.arxivId,
			authors: p.authors,
			year: p.year,
			raw: ref.raw
		};
	}
	return ref;
}
