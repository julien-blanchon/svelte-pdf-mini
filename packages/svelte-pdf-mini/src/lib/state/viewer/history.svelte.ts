/** A place in the document, for history and reading position. */
export interface ViewLocation {
	page: number;
	/** 0..1 down the page (top of the viewport). */
	fraction: number;
}

/** Back / forward stacks for in-document jumps (links, citations, outline). */
export class NavigationHistory {
	back = $state.raw<ViewLocation[]>([]);
	forward = $state.raw<ViewLocation[]>([]);
	readonly canGoBack = $derived(this.back.length > 0);
	readonly canGoForward = $derived(this.forward.length > 0);

	constructor(private readonly limit = 50) {}

	/** Remember `from` before a jump; clears the forward stack. */
	push(from: ViewLocation) {
		this.back = [...this.back, from].slice(-this.limit);
		this.forward = [];
	}

	/** Pop the previous location, remembering `current` for forward. */
	goBack(current: ViewLocation): ViewLocation | null {
		const to = this.back.at(-1);
		if (!to) return null;
		this.back = this.back.slice(0, -1);
		this.forward = [...this.forward, current];
		return to;
	}

	goForward(current: ViewLocation): ViewLocation | null {
		const to = this.forward.at(-1);
		if (!to) return null;
		this.forward = this.forward.slice(0, -1);
		this.back = [...this.back, current];
		return to;
	}

	clear() {
		this.back = [];
		this.forward = [];
	}
}
