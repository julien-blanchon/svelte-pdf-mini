import type { FetchLike, PaperMetadata, ReferenceQuery } from './types.js';

/** Titles shorter than this are too ambiguous to search by. */
const MIN_SEARCH_TITLE = 8;

/** The query's title, when long enough to search by. */
export function searchableTitle(q: ReferenceQuery): string | undefined {
	return q.title && q.title.length >= MIN_SEARCH_TITLE ? q.title : undefined;
}

/** Apply an optional proxy: a URL prefix (the target is URL-encoded) or a rewrite function. */
export function proxied(
	proxy: string | ((url: string) => string) | undefined,
	url: string
): string {
	if (typeof proxy === 'function') return proxy(url);
	if (proxy) return `${proxy}${encodeURIComponent(url)}`;
	return url;
}

export function getFetch(f?: FetchLike): FetchLike {
	const g = f ?? (globalThis.fetch as unknown as FetchLike | undefined);
	if (!g) throw new Error('svelte-pdf-mini: no fetch available');
	return g;
}

export async function getJson<T>(
	fetch: FetchLike,
	url: string,
	init?: { headers?: Record<string, string>; signal?: AbortSignal },
	retries = 2
): Promise<T | null> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, init);
		if (res.status === 404) return null;
		// Short throttling (429 / 503): back off briefly, then give up so the chain can move on.
		if ((res.status === 429 || res.status === 503) && attempt < retries) {
			const header = Number(
				(res as { headers?: { get?(n: string): string | null } }).headers?.get?.('retry-after')
			);
			const wait = Math.min(
				4000,
				Number.isFinite(header) && header > 0 ? header * 1000 : 800 * 2 ** attempt
			);
			await sleep(wait, init?.signal);
			continue;
		}
		if (!res.ok) throw new ProviderError(`HTTP ${res.status} for ${url}`, res.status);
		return (await res.json()) as T;
	}
}

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), {
			once: true
		});
	});
}

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ProviderError';
	}
}

const words = (s: string) =>
	new Set(
		s
			.normalize('NFKD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.split(' ')
			.filter((w) => w.length > 1)
	);

/** Dice similarity of two titles' word sets (0..1). */
export function titleSimilarity(a: string, b: string): number {
	const A = words(a);
	const B = words(b);
	if (!A.size || !B.size) return 0;
	let common = 0;
	for (const w of A) if (B.has(w)) common++;
	return (2 * common) / (A.size + B.size);
}

/** Merge metadata field by field (first non-empty wins). */
export function mergeMetadata(
	a: PaperMetadata | null,
	b: PaperMetadata | null
): PaperMetadata | null {
	if (!a) return b;
	if (!b) return a;
	return {
		title: a.title || b.title,
		authors: a.authors.length ? a.authors : b.authors,
		year: a.year ?? b.year,
		venue: a.venue || b.venue,
		abstract: a.abstract || b.abstract,
		tldr: a.tldr || b.tldr,
		citationCount: a.citationCount ?? b.citationCount,
		referenceCount: a.referenceCount ?? b.referenceCount,
		ids: { ...b.ids, ...strip(a.ids) },
		urls: { ...b.urls, ...strip(a.urls) },
		source: a.source === b.source ? a.source : `${a.source}+${b.source}`
	};
}

function strip<T extends Record<string, unknown>>(o: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(o).filter(([, v]) => v !== undefined && v !== '')
	) as Partial<T>;
}

/** Spaces requests at least `intervalMs` apart (simple rate limiter). */
export function rateLimiter(intervalMs: number) {
	let next = 0;
	return async (signal?: AbortSignal) => {
		const now = Date.now();
		const wait = Math.max(0, next - now);
		next = Math.max(now, next) + intervalMs;
		if (wait) {
			await new Promise<void>((resolve, reject) => {
				const t = setTimeout(resolve, wait);
				signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), {
					once: true
				});
			});
		}
	};
}

/** Search matches must agree on the year (±1) when both are known (preprint vs. venue year). */
export function yearOk(
	queryYear: number | undefined,
	foundYear: number | undefined | null
): boolean {
	return !queryYear || !foundYear || Math.abs(queryYear - foundYear) <= 1;
}
