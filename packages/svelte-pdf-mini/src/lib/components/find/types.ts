import type { Snippet } from 'svelte';
import type { SearchOptions } from '../../core/text/search.js';
import type {
	ButtonPartProps,
	DivPartProps,
	InputPartProps
} from '../../internal/component-types.js';
import type { FindMatch, FindState } from '../../state/find.svelte.js';
import type { FindOption } from './options.js';

export interface FindRootProps extends SearchOptions {
	/** Search query. Bindable. */
	query?: string;
	onQueryChange?: (query: string) => void;
	/** Debounce in ms. Default 150. */
	debounce?: number;
	/** The find state (bind:find to drive it from outside). */
	find?: FindState;
	children?: Snippet<[{ find: FindState }]>;
}

export type FindInputProps = InputPartProps<{
	/** Focus this input on Ctrl/⌘ + F while the pointer or focus is in the viewer. Default true. */
	captureShortcut?: boolean;
}>;
export type FindButtonProps = ButtonPartProps<Record<never, never>, { disabled: boolean }>;
export type FindToggleProps = ButtonPartProps<{ option: FindOption }, { pressed: boolean }>;
export type FindCountProps = DivPartProps<
	Record<never, never>,
	{ current: number; total: number; status: FindState['status'] }
>;
export type FindResultProps = ButtonPartProps<
	{ match: FindMatch },
	{ active: boolean; match: FindMatch }
>;
export type FindLayerProps = DivPartProps<{
	/** Which matches to draw: every match, only the current one, or none (list-only UIs). Default 'all'. */
	show?: 'all' | 'current' | 'none';
	/** Custom SVG for a match (inside a viewBox in page points): one `points` string per quad. */
	match?: Snippet<[{ match: FindMatch; current: boolean; points: string[] }]>;
}>;
