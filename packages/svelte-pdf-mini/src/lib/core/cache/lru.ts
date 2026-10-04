/**
 * Size-bounded LRU map. Each entry has a cost (bytes, or 1 for count-bounded
 * caches); the least recently used entries are evicted (and disposed) once the
 * total cost exceeds the budget.
 */
export class LruCache<K, V> {
	#map = new Map<K, { value: V; cost: number }>();
	#total = 0;

	constructor(
		public budget: number,
		private dispose?: (value: V, key: K) => void
	) {}

	get size() {
		return this.#map.size;
	}

	/** Total cost of the cached entries. */
	get cost() {
		return this.#total;
	}

	get(key: K): V | undefined {
		const e = this.#map.get(key);
		if (!e) return undefined;
		// Refresh recency.
		this.#map.delete(key);
		this.#map.set(key, e);
		return e.value;
	}

	peek(key: K): V | undefined {
		return this.#map.get(key)?.value;
	}

	has(key: K) {
		return this.#map.has(key);
	}

	set(key: K, value: V, cost = 1) {
		this.delete(key);
		if (cost > this.budget) {
			this.dispose?.(value, key);
			return;
		}
		this.#map.set(key, { value, cost });
		this.#total += cost;
		this.#evict();
	}

	delete(key: K): boolean {
		const e = this.#map.get(key);
		if (!e) return false;
		this.#map.delete(key);
		this.#total -= e.cost;
		this.dispose?.(e.value, key);
		return true;
	}

	/** Entries in recency order (oldest first). */
	*entries(): IterableIterator<[K, V]> {
		for (const [k, e] of this.#map) yield [k, e.value];
	}

	clear() {
		for (const [k, e] of this.#map) this.dispose?.(e.value, k);
		this.#map.clear();
		this.#total = 0;
	}

	/** Change the budget (evicts if needed). */
	resize(budget: number) {
		this.budget = budget;
		this.#evict();
	}

	#evict() {
		for (const [k] of this.#map) {
			if (this.#total <= this.budget) break;
			this.delete(k);
		}
	}
}
