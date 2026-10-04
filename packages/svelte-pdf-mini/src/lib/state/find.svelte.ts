import { untrack } from 'svelte';
import { matchSnippet, searchPageText, type SearchOptions } from '../core/text/search.js';
import type { Quad } from '../core/text/text-index.js';
import type { PdfRect } from '../core/types.js';
import { Synced } from '../internal/synced.svelte.js';
import type { Getter } from '../internal/types.js';
import type { ViewerState } from './viewer.svelte.js';

export interface FindMatch {
	/** Index in `matches`. */
	index: number;
	page: number;
	start: number;
	end: number;
	quads: Quad[];
	rect: PdfRect | null;
	snippet: { before: string; match: string; after: string };
}

export interface FindOptions extends SearchOptions {
	viewer: ViewerState;
	query?: string | Getter<string>;
	onQueryChange?: (query: string) => void;
	/** Debounce before searching (ms). Default 150. */
	debounce?: number;
	/** Stop after this many matches. Default 5000. */
	limit?: number;
}

/**
 * Incremental document search. Pages are searched one by one (yielding to the
 * main thread), results stream into `matches`, and `next()` / `prev()` move a
 * current match that is scrolled into view.
 */
export class FindState {
	readonly viewer: ViewerState;
	options = $state<SearchOptions>({});
	matches = $state.raw<FindMatch[]>([]);
	/** Index of the current match, -1 when none. */
	current = $state(-1);
	status = $state<'idle' | 'searching' | 'done'>('idle');
	/** Pages searched so far (progress). */
	searchedPages = $state(0);
	readonly total = $derived(this.matches.length);
	readonly currentMatch = $derived(this.matches[this.current] ?? null);
	/** Matches grouped by page. */
	readonly byPage = $derived.by(() => {
		const map = new Map<number, FindMatch[]>();
		for (const m of this.matches) {
			let list = map.get(m.page);
			if (!list) map.set(m.page, (list = []));
			list.push(m);
		}
		return map;
	});

	#query: Synced<string>;
	#gen = 0;
	#limit: number;

	constructor(opts: FindOptions) {
		this.viewer = opts.viewer;
		this.#query = new Synced({ value: opts.query ?? '', onChange: opts.onQueryChange });
		this.#limit = opts.limit ?? 5000;
		this.options = {
			caseSensitive: opts.caseSensitive,
			diacritics: opts.diacritics,
			wholeWord: opts.wholeWord,
			regex: opts.regex
		};
		const debounce = opts.debounce ?? 150;

		$effect(() => {
			const query = this.query;
			const options = { ...this.options };
			const doc = this.viewer.document.proxy;
			const gen = ++this.#gen;
			if (!doc || !query.trim()) {
				untrack(() => this.#reset('idle'));
				return;
			}
			const timer = setTimeout(() => this.#run(query, options, gen), debounce);
			return () => clearTimeout(timer);
		});
	}

	get query() {
		return this.#query.current;
	}
	set query(q: string) {
		this.#query.current = q;
	}

	/** Go to the next match (wraps). */
	next() {
		if (!this.total) return;
		this.goTo(this.current < 0 ? this.#firstFromView() : (this.current + 1) % this.total);
	}

	prev() {
		if (!this.total) return;
		this.goTo(
			this.current < 0 ? this.#firstFromView() : (this.current - 1 + this.total) % this.total
		);
	}

	/** Make a match current and scroll it into view. */
	goTo(index: number) {
		const m = this.matches[index];
		if (!m) return;
		this.current = index;
		this.viewer.focus(m.rect ? { page: m.page, rect: m.rect } : { page: m.page }, {
			highlight: false,
			align: 'center'
		});
	}

	clear() {
		this.query = '';
	}

	#firstFromView() {
		const page = this.viewer.page;
		const i = this.matches.findIndex((m) => m.page >= page);
		return i < 0 ? 0 : i;
	}

	#reset(status: 'idle' | 'searching') {
		this.matches = [];
		this.current = -1;
		this.searchedPages = 0;
		this.status = status;
	}

	async #run(query: string, options: SearchOptions, gen: number) {
		const doc = this.viewer.document;
		this.#reset('searching');
		const n = doc.numPages;
		// Start from the current page so nearby hits arrive first, but keep results in page order.
		const results: FindMatch[][] = Array.from({ length: n }, () => []);
		const start = this.viewer.page;
		const order = Array.from({ length: n }, (_, i) => ((start - 1 + i) % n) + 1);
		let count = 0;
		let lastFlush = performance.now();
		for (const page of order) {
			if (gen !== this.#gen) return;
			const text = await doc.getPageText(page).catch(() => null);
			if (gen !== this.#gen) return;
			if (text) {
				for (const m of searchPageText(text, query, options)) {
					if (count >= this.#limit) break;
					results[page - 1].push({
						index: 0,
						...m,
						quads: text.quadsFor(m.start, m.end),
						rect: text.rectFor(m.start, m.end),
						snippet: matchSnippet(text, m)
					});
					count++;
				}
			}
			this.searchedPages++;
			if (performance.now() - lastFlush > 60) {
				this.#publish(results);
				lastFlush = performance.now();
				await new Promise((r) => setTimeout(r));
			}
		}
		if (gen !== this.#gen) return;
		this.#publish(results);
		this.status = 'done';
		// First search: jump to the first hit at or after the current page.
		if (this.current < 0 && this.matches.length) this.goTo(this.#firstFromView());
	}

	#publish(results: FindMatch[][]) {
		const flat = results.flat();
		flat.forEach((m, i) => (m.index = i));
		const cur = this.currentMatch;
		this.matches = flat;
		if (cur) this.current = flat.findIndex((m) => m.page === cur.page && m.start === cur.start);
	}
}
