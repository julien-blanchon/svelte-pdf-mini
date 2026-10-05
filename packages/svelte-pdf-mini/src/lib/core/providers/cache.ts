/** In-memory LRU cache for provider results, with an optional persistent adapter. */
import type { CitationProvider, PaperMetadata, ReferenceQuery } from './types.js';
import { toQuery } from './types.js';

export interface CacheAdapter {
	get(key: string): Promise<PaperMetadata | null | undefined> | PaperMetadata | null | undefined;
	set(key: string, value: PaperMetadata | null): Promise<void> | void;
}

export class MetadataCache {
	#map = new Map<string, PaperMetadata | null>();
	constructor(
		private max = 500,
		private adapter?: CacheAdapter
	) {}

	async get(key: string): Promise<PaperMetadata | null | undefined> {
		if (this.#map.has(key)) {
			const v = this.#map.get(key)!;
			this.#map.delete(key);
			this.#map.set(key, v);
			return v;
		}
		const v = await this.adapter?.get(key);
		if (v !== undefined) this.#remember(key, v);
		return v;
	}

	async set(key: string, value: PaperMetadata | null) {
		this.#remember(key, value);
		await this.adapter?.set(key, value);
	}

	#remember(key: string, value: PaperMetadata | null) {
		this.#map.delete(key);
		this.#map.set(key, value);
		while (this.#map.size > this.max) this.#map.delete(this.#map.keys().next().value!);
	}
}

export function queryKey(q: ReferenceQuery): string {
	if (q.doi) return `doi:${q.doi.toLowerCase()}`;
	if (q.arxivId) return `arxiv:${q.arxivId.replace(/v\d+$/, '')}`;
	return `t:${(q.title ?? q.raw ?? '').toLowerCase().replace(/\W+/g, ' ').trim()}|${q.year ?? ''}`;
}

/** Wrap a provider with a cache (misses are cached too, as null). Concurrent identical lookups share one request. */
export function withCache(
	provider: CitationProvider,
	cache = new MetadataCache()
): CitationProvider {
	const inflight = new Map<string, Promise<PaperMetadata | null>>();
	return {
		id: provider.id,
		async resolve(ref, opts) {
			const key = `${provider.id}|${queryKey(toQuery(ref))}`;
			const hit = await cache.get(key);
			if (hit !== undefined) return hit;
			let p = inflight.get(key);
			if (!p) {
				// Shared by every caller, so no caller's signal: one aborting must not fail the others.
				p = provider
					.resolve(ref, { ...opts, signal: undefined })
					.then(async (v) => (await cache.set(key, v), v))
					.finally(() => inflight.delete(key));
				inflight.set(key, p);
			}
			return untilAborted(p, opts?.signal);
		}
	};
}

/** `p`, or an AbortError as soon as `signal` aborts (the work itself goes on). */
function untilAborted<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return p;
	signal.throwIfAborted();
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}
