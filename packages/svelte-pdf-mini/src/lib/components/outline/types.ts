import type { Snippet } from 'svelte';
import type { ButtonPartProps, DivPartProps } from '../../internal/component-types.js';
import type { OutlineItem, OutlineState } from '../../state/outline.svelte.js';

export interface OutlineItemSnippetProps {
	item: OutlineItem;
	depth: number;
	active: boolean;
	/** The active item is inside this one. */
	containsActive: boolean;
	expanded: boolean;
	hasChildren: boolean;
	toggle: () => void;
}

export type OutlineRootProps = DivPartProps<
	{ expandDepth?: number; outline?: OutlineState },
	{ outline: OutlineState }
>;
export type OutlineTreeProps = DivPartProps<{
	/** Custom row content. */
	item?: Snippet<[OutlineItemSnippetProps]>;
	/** Shown when the PDF has no outline. */
	empty?: Snippet;
}>;
export type OutlineItemProps = ButtonPartProps<{ item: OutlineItem }, OutlineItemSnippetProps>;
