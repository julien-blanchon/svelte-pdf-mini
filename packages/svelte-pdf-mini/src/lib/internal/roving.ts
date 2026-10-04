/**
 * Roving focus for lists of items with a single tab stop (WAI-ARIA "roving
 * tabindex"): arrows move between items, Home / End jump to the ends, and
 * Enter / Space activate the focused one.
 */

export type RovingOrientation = 'vertical' | 'horizontal' | 'both';

export interface RovingOptions {
	/** Which arrow keys move focus. Default 'vertical'. */
	orientation?: RovingOrientation;
	/** Wrap from the last item to the first (and back). Default true. */
	loop?: boolean;
}

const STEPS: Record<RovingOrientation, Record<string, 1 | -1>> = {
	vertical: { ArrowDown: 1, ArrowUp: -1 },
	horizontal: { ArrowRight: 1, ArrowLeft: -1 },
	both: { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }
};

/**
 * Index the key moves focus to, or null when the key does not move focus.
 * `count` is the number of items, `index` the focused one.
 */
export function rovingTarget(
	key: string,
	index: number,
	count: number,
	{ orientation = 'vertical', loop = true }: RovingOptions = {}
): number | null {
	if (count <= 0) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	const step = STEPS[orientation][key];
	if (!step) return null;
	const next = index + step;
	return loop ? (next + count) % count : Math.min(count - 1, Math.max(0, next));
}

/** Enter or Space: activates the focused item. */
export const isActivationKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';

/**
 * Handles a keydown on an item of a roving list: moves focus (calling
 * `focus(next)`) or activates (`activate()`). Returns true when it handled the
 * key (the event is then prevented and stopped).
 */
export function handleRovingKey(
	e: KeyboardEvent,
	index: number,
	count: number,
	{
		focus,
		activate,
		...options
	}: RovingOptions & { focus: (index: number) => void; activate?: () => void }
): boolean {
	const next = rovingTarget(e.key, index, count, options);
	if (next !== null) focus(next);
	else if (activate && isActivationKey(e)) activate();
	else return false;
	e.preventDefault();
	e.stopPropagation();
	return true;
}
