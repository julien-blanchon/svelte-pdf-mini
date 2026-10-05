/**
 * A tiny priority queue for expensive, cancellable work (page renders,
 * thumbnails). Lower priority number runs first. Jobs with the same key
 * replace each other, so a page re-queued at a new zoom drops the old job.
 */
export interface Job {
	key: string;
	priority: number;
	run: (signal: AbortSignal) => Promise<void>;
	/** Called when the job is cancelled before it started (`run` never runs). */
	onCancel?: () => void;
}

interface Entry extends Job {
	controller: AbortController;
	seq: number;
}

export class RenderScheduler {
	#queue: Entry[] = [];
	#running = new Map<string, Entry>();
	#seq = 0;
	constructor(private concurrency = 2) {}

	/** Queue a job; returns a function that cancels it (queued or running). */
	schedule(job: Job): () => void {
		this.cancel(job.key);
		const entry: Entry = { ...job, controller: new AbortController(), seq: this.#seq++ };
		this.#queue.push(entry);
		this.#pump();
		return () => this.#cancelEntry(entry);
	}

	/** Change the priority of a queued job (e.g. it became visible). */
	reprioritize(key: string, priority: number) {
		const e = this.#queue.find((q) => q.key === key);
		if (e) e.priority = priority;
	}

	cancel(key: string) {
		const queued = this.#queue.find((q) => q.key === key);
		if (queued) this.#cancelEntry(queued);
		const running = this.#running.get(key);
		if (running) this.#cancelEntry(running);
	}

	clear() {
		for (const e of [...this.#queue, ...this.#running.values()]) e.controller.abort();
		for (const e of this.#queue) e.onCancel?.();
		this.#queue = [];
		this.#running.clear();
	}

	#cancelEntry(entry: Entry) {
		entry.controller.abort();
		if (this.#queue.includes(entry)) entry.onCancel?.();
		this.#queue = this.#queue.filter((q) => q !== entry);
		if (this.#running.get(entry.key) === entry) this.#running.delete(entry.key);
		this.#pump();
	}

	#pump() {
		while (this.#running.size < this.concurrency && this.#queue.length) {
			this.#queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
			const entry = this.#queue.shift()!;
			this.#running.set(entry.key, entry);
			entry
				.run(entry.controller.signal)
				.catch((err) => {
					if (!entry.controller.signal.aborted && !isCancel(err))
						console.error('[svelte-pdf-mini]', err);
				})
				.finally(() => {
					if (this.#running.get(entry.key) === entry) this.#running.delete(entry.key);
					this.#pump();
				});
		}
	}
}

export function isCancel(err: unknown): boolean {
	return (
		!!err &&
		typeof err === 'object' &&
		'name' in err &&
		(err.name === 'RenderingCancelledException' || err.name === 'AbortError')
	);
}
