import { describe, expect, it } from 'vitest';
import { LruCache } from './lru.js';

describe('LruCache', () => {
	it('evicts least recently used entries past the budget and disposes them', () => {
		const disposed: string[] = [];
		const c = new LruCache<string, number>(10, (_v, k) => disposed.push(k));
		c.set('a', 1, 4);
		c.set('b', 2, 4);
		c.get('a'); // a is now most recent
		c.set('c', 3, 4); // total 12 > 10 → evict b
		expect(c.has('b')).toBe(false);
		expect(c.has('a')).toBe(true);
		expect(disposed).toEqual(['b']);
		expect(c.cost).toBe(8);
	});

	it('rejects entries larger than the budget and shrinks on resize', () => {
		const c = new LruCache<string, number>(5);
		c.set('big', 1, 6);
		expect(c.size).toBe(0);
		c.set('x', 1, 2);
		c.set('y', 1, 2);
		c.resize(2);
		expect([...c.entries()].map(([k]) => k)).toEqual(['y']);
	});
});
