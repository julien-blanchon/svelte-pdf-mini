import { untrack } from 'svelte';
import type { PaperHover, PaperState } from '../../state/paper.svelte.js';

/** A hovered in-text target shown by a floating part. */
export type ShownTarget = Pick<PaperHover, 'id' | 'anchor'>;

export interface PaperHoverIntentOptions {
	/** Delay (ms) before showing. */
	delay: () => number;
	/** Switch right away when moving to another target while already open. */
	instantSwitch?: boolean;
	/** Called when a target gets shown, with the previously shown one. */
	onShow?: (next: ShownTarget, previous: ShownTarget | null) => void;
}

/** Delay (ms) before hiding once nothing of this kind is hovered. */
const HIDE_DELAY = 120;

/**
 * Hover intent for the paper's floating parts (citation card, cross-ref preview):
 * shows the hovered target of `kind` after a delay and hides it shortly after
 * the pointer leaves. Create during component initialization.
 */
export class PaperHoverIntent {
	shown = $state.raw<ShownTarget | null>(null);
	/** Last shown target (kept while closing, so exit transitions keep their content). */
	last = $state.raw<ShownTarget | null>(null);
	readonly open = $derived(this.shown !== null);
	/** What to display: the shown target, else the last one. */
	readonly current = $derived(this.shown ?? this.last);

	constructor(paper: PaperState, kind: PaperHover['kind'], options: PaperHoverIntentOptions) {
		$effect(() => {
			const hovered = paper.hovered;
			// Nothing opens while a text selection is being dragged.
			if (hovered?.kind !== kind || paper.viewer.selection.selecting) {
				const t = setTimeout(() => (this.shown = null), HIDE_DELAY);
				return () => clearTimeout(t);
			}
			// Untracked: showing must not re-run this effect.
			const previous = untrack(() => this.shown);
			if (previous?.id === hovered.id && previous.anchor === hovered.anchor) return;
			const delay = options.instantSwitch && previous ? 0 : options.delay();
			const t = setTimeout(() => {
				const next = { id: hovered.id, anchor: hovered.anchor };
				options.onShow?.(next, previous);
				this.shown = this.last = next;
			}, delay);
			return () => clearTimeout(t);
		});
	}
}
