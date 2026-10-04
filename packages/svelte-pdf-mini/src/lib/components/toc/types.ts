import type { Snippet } from 'svelte';
import type { Section } from '../../core/paper/types.js';
import type { DivPartProps } from '../../internal/component-types.js';
import type { PaperState } from '../../state/paper.svelte.js';

export interface TocItemSnippetProps {
	section: Section;
	depth: number;
	/** This is the section being read. */
	active: boolean;
	/** The active section is this one or inside it. */
	inPath: boolean;
	/** Position in the document, 0..1. */
	position: number;
	go: () => void;
}

interface TocBase {
	/** Deepest level shown (1 = top-level only). */
	maxDepth?: number;
	item?: Snippet<[TocItemSnippetProps]>;
	/** Shown while analysing or when no sections were found. */
	empty?: Snippet<[{ status: PaperState['status'] }]>;
}

/** `maxDepth` defaults to 3. */
export type TocTreeProps = DivPartProps<TocBase>;
/** `maxDepth` defaults to 1. */
export type TocFlatProps = DivPartProps<TocBase>;
export type TocBreadcrumbProps = DivPartProps<{
	separator?: Snippet;
	item?: Snippet<[TocItemSnippetProps]>;
}>;
export type TocProgressProps = DivPartProps<
	{ item?: Snippet<[TocItemSnippetProps & { start: number; end: number }]> },
	{ progress: number }
>;
export type TocRailProps = DivPartProps<{
	/** Deepest level shown (1 = top-level only). Default 2. */
	maxDepth?: number;
	item?: Snippet<[TocItemSnippetProps]>;
}>;
