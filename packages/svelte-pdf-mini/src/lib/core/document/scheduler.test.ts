import { describe, expect, it } from 'vitest';
import { RenderScheduler } from './scheduler.js';

const defer = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
};

describe('RenderScheduler', () => {
	it('runs by priority with bounded concurrency', async () => {
		const s = new RenderScheduler(1);
		const order: string[] = [];
		const gate = defer();
		s.schedule({
			key: 'a',
			priority: 1,
			run: async () => {
				order.push('a');
				await gate.promise;
			}
		});
		s.schedule({
			key: 'b',
			priority: 2,
			run: async () => {
				order.push('b');
			}
		});
		s.schedule({
			key: 'c',
			priority: 0,
			run: async () => {
				order.push('c');
			}
		});
		gate.resolve();
		await new Promise((r) => setTimeout(r, 10));
		expect(order).toEqual(['a', 'c', 'b']);
	});

	it('replaces jobs with the same key and aborts the running one', async () => {
		const s = new RenderScheduler(1);
		const gate = defer();
		let aborted = false;
		const ran: number[] = [];
		s.schedule({
			key: 'p1',
			priority: 0,
			run: async (signal) => {
				signal.addEventListener('abort', () => (aborted = true));
				await gate.promise;
				ran.push(1);
			}
		});
		s.schedule({ key: 'p1', priority: 0, run: async () => void ran.push(2) });
		gate.resolve();
		await new Promise((r) => setTimeout(r, 10));
		expect(aborted).toBe(true);
		expect(ran).toContain(2);
	});

	it('cancel() drops queued work', async () => {
		const s = new RenderScheduler(1);
		const gate = defer();
		const ran: string[] = [];
		s.schedule({ key: 'x', priority: 0, run: () => gate.promise });
		const cancel = s.schedule({ key: 'y', priority: 0, run: async () => void ran.push('y') });
		cancel();
		gate.resolve();
		await new Promise((r) => setTimeout(r, 10));
		expect(ran).toEqual([]);
	});

	it('tells a job it was cancelled before it ran', async () => {
		const s = new RenderScheduler(1);
		const gate = defer();
		let cancelled = 0;
		s.schedule({ key: 'x', priority: 0, run: () => gate.promise, onCancel: () => cancelled++ });
		const cancel = s.schedule({
			key: 'y',
			priority: 0,
			run: async () => {},
			onCancel: () => cancelled++
		});
		cancel();
		// Running jobs learn it from their signal instead.
		s.clear();
		gate.resolve();
		expect(cancelled).toBe(1);
	});
});
