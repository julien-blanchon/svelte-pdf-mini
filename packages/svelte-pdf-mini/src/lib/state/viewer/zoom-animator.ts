/** A client-space point the zoom keeps fixed. */
export interface ClientPoint {
	clientX: number;
	clientY: number;
}

/** Zoom easing time constant (ms): ~95% of the way in 3τ. */
const ZOOM_TAU = 45;

/**
 * Eases zoom towards a target in log space (zooming in and out feel
 * symmetric), one `apply` per animation frame.
 */
export class ZoomAnimator {
	target = NaN;
	anchor: ClientPoint | null = null;
	/** Keep the current fit mode (animating a mode switch) instead of switching to manual. */
	keepMode = false;
	#raf = 0;
	#last = 0;

	constructor(
		private readonly current: () => number,
		private readonly apply: (zoom: number, anchor: ClientPoint | null) => void
	) {}

	get running() {
		return this.#raf !== 0;
	}

	/** Where zoom is heading (the target while animating, else the current zoom). */
	get destination() {
		return this.running ? this.target : this.current();
	}

	start(target: number, anchor: ClientPoint | null, keepMode = false) {
		this.target = target;
		this.anchor = anchor;
		this.keepMode = keepMode;
		if (!this.#raf) {
			this.#last = performance.now();
			this.#raf = requestAnimationFrame(this.#step);
		}
	}

	stop() {
		cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.keepMode = false;
	}

	#step = (t: number) => {
		const dt = Math.min(64, t - this.#last);
		this.#last = t;
		const current = this.current();
		const k = 1 - Math.exp(-dt / ZOOM_TAU);
		let next = Math.exp(Math.log(current) + (Math.log(this.target) - Math.log(current)) * k);
		const done = Math.abs(Math.log(this.target / next)) < 0.002;
		if (done) next = this.target;
		this.#raf = done ? 0 : requestAnimationFrame(this.#step);
		this.apply(next, this.anchor);
		if (done) this.keepMode = false;
	};
}
