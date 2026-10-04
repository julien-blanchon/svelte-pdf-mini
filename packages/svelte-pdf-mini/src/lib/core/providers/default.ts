/**
 * The default chain (cached, errors and 429s fall through to the next provider):
 * - arXiv id → Semantic Scholar first (exact; works without a key at ~1 req/s);
 * - DOI / title → OpenAlex, then Semantic Scholar for TLDR, abstract and counts.
 */
import { MetadataCache, withCache, type CacheAdapter } from './cache.js';
import { openAlex } from './openalex.js';
import { semanticScholar } from './semantic-scholar.js';
import { crossref } from './crossref.js';
import type { CitationProvider, FetchLike, PaperMetadata } from './types.js';
import { toQuery } from './types.js';
import { mergeMetadata } from './util.js';

export interface DefaultProviderOptions {
	semanticScholarKey?: string;
	/** Use Semantic Scholar (keyless use is rate-limited to ~1 req/s). Default true. */
	semanticScholar?: boolean;
	openAlexKey?: string;
	mailto?: string;
	/** Add Crossref bibliographic matching as a last resort. Default false. */
	crossref?: boolean;
	fetch?: FetchLike;
	/** Persistent cache (e.g. IndexedDB) behind the in-memory LRU. */
	cache?: CacheAdapter;
	cacheSize?: number;
}

/** Try providers in order and merge their answers field by field. */
export function chainProviders(
	providers: CitationProvider[],
	{
		stopWhenComplete = true,
		isComplete = (m: PaperMetadata) => !!(m.abstract && m.tldr)
	}: { stopWhenComplete?: boolean; isComplete?: (m: PaperMetadata) => boolean } = {}
): CitationProvider {
	return {
		id: providers.map((p) => p.id).join('+'),
		async resolve(ref, opts) {
			let result: PaperMetadata | null = null;
			for (const p of providers) {
				opts?.signal?.throwIfAborted();
				// Later providers get the ids found so far (better exact lookups).
				const q = toQuery(ref);
				const next = await p
					.resolve(
						result
							? {
									...q,
									doi: q.doi ?? result.ids.doi,
									arxivId: q.arxivId ?? result.ids.arxiv,
									title: q.title ?? result.title
								}
							: ref,
						opts
					)
					.catch((err) => {
						if (opts?.signal?.aborted) throw err;
						return null;
					});
				result = mergeMetadata(result, next);
				if (stopWhenComplete && result && isComplete(result)) break;
			}
			return result;
		}
	};
}

export function defaultCitationProvider(opts: DefaultProviderOptions = {}): CitationProvider {
	const oa = openAlex({ fetch: opts.fetch, mailto: opts.mailto, apiKey: opts.openAlexKey });
	const s2 =
		opts.semanticScholar === false
			? null
			: semanticScholar({ fetch: opts.fetch, apiKey: opts.semanticScholarKey });
	const cr = opts.crossref ? crossref({ fetch: opts.fetch, mailto: opts.mailto }) : null;
	// Keyless Semantic Scholar is heavily rate-limited (and its 429s carry no CORS
	// headers, so browsers log them): without a key, stop as soon as we have an abstract.
	const isComplete = opts.semanticScholarKey ? undefined : (m: PaperMetadata) => !!m.abstract;
	const byTitle = chainProviders(
		[oa, s2, cr].filter((p): p is CitationProvider => !!p),
		{ isComplete }
	);
	const byArxiv = s2 ? chainProviders([s2, oa], { isComplete }) : byTitle;
	const provider: CitationProvider = {
		id: byTitle.id,
		resolve: (ref, o) =>
			(toQuery(ref).arxivId && !toQuery(ref).doi ? byArxiv : byTitle).resolve(ref, o)
	};
	return withCache(provider, new MetadataCache(opts.cacheSize ?? 500, opts.cache));
}
