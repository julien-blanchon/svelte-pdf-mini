/** A single pending timeout: each `set` replaces the previous one. */
export interface Timeout {
	set(fn: () => void, ms: number): void;
	clear(): void;
}

export function createTimeout(): Timeout {
	let id: ReturnType<typeof setTimeout> | undefined;
	return {
		set(fn, ms) {
			clearTimeout(id);
			id = setTimeout(fn, ms);
		},
		clear() {
			clearTimeout(id);
		}
	};
}

/** Is the pointer over an element matching one of `selectors` (e.g. a preview it moved onto)? */
export function isHovered(...selectors: string[]): boolean {
	return document.querySelector(selectors.map((s) => `${s}:hover`).join(', ')) !== null;
}
