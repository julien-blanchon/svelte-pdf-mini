/**
 * Minimal async key–value adapter for persistent caches (paper analysis,
 * citation metadata…). `indexedDbStore()` is a ready-made browser adapter.
 */
export interface KeyValueStore<V = unknown> {
	get(key: string): Promise<V | undefined>;
	set(key: string, value: V): Promise<void>;
	delete?(key: string): Promise<void>;
}

/** In-memory store (useful for tests and SSR). */
export function memoryStore<V>(): KeyValueStore<V> {
	const map = new Map<string, V>();
	return {
		get: async (k) => map.get(k),
		set: async (k, v) => void map.set(k, v),
		delete: async (k) => void map.delete(k)
	};
}

/**
 * IndexedDB-backed store (values must be structured-cloneable). One object
 * store per `name`; failures (private mode, quota) degrade to no-ops.
 */
export function indexedDbStore<V>(name = 'svelte-pdf-mini', store = 'cache'): KeyValueStore<V> {
	let db: Promise<IDBDatabase | null> | null = null;
	const open = () =>
		(db ??= new Promise((resolve) => {
			if (typeof indexedDB === 'undefined') return resolve(null);
			const req = indexedDB.open(name, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(store);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
		}));
	const run = async <T>(
		mode: IDBTransactionMode,
		fn: (s: IDBObjectStore) => IDBRequest<T>
	): Promise<T | undefined> => {
		const d = await open();
		if (!d) return undefined;
		return new Promise((resolve) => {
			const req = fn(d.transaction(store, mode).objectStore(store));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(undefined);
		});
	};
	return {
		get: (k) => run('readonly', (s) => s.get(k)) as Promise<V | undefined>,
		set: async (k, v) => void (await run('readwrite', (s) => s.put(v, k))),
		delete: async (k) => void (await run('readwrite', (s) => s.delete(k)))
	};
}
