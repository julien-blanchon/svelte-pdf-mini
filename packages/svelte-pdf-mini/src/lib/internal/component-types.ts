import type { Snippet } from 'svelte';
import type {
	HTMLAttributes,
	HTMLButtonAttributes,
	HTMLFormAttributes,
	HTMLInputAttributes,
	HTMLSelectAttributes
} from 'svelte/elements';

/** Props every part accepts: `ref`, `child` (render your own element) and `children`. */
export type WithChild<Own, SnippetProps = Record<never, never>, Ref = HTMLElement> = Own & {
	/** Render your own element: spread `props` on it. */
	child?: Snippet<[SnippetProps & { props: Record<string, unknown> }]>;
	children?: Snippet<[SnippetProps]>;
	/** The rendered DOM element (bindable). */
	ref?: Ref | null;
};

type Without<T, K> = Omit<T, keyof K | 'children' | 'child'>;

export type DivPartProps<Own = Record<never, never>, S = Record<never, never>> = WithChild<
	Own,
	S,
	HTMLDivElement
> &
	Without<HTMLAttributes<HTMLDivElement>, Own>;
export type ButtonPartProps<Own = Record<never, never>, S = Record<never, never>> = WithChild<
	Own,
	S,
	HTMLButtonElement
> &
	Without<HTMLButtonAttributes, Own>;
export type InputPartProps<Own = Record<never, never>, S = Record<never, never>> = WithChild<
	Own,
	S,
	HTMLInputElement
> &
	Without<HTMLInputAttributes, Own>;
export type FormPartProps<Own = Record<never, never>, S = Record<never, never>> = WithChild<
	Own,
	S,
	HTMLFormElement
> &
	Without<HTMLFormAttributes, Own>;
export type SelectPartProps<Own = Record<never, never>, S = Record<never, never>> = WithChild<
	Own,
	S,
	HTMLSelectElement
> &
	Without<HTMLSelectAttributes, Own>;
