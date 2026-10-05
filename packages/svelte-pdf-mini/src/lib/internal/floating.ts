import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';

export type FloatingReference =
	Element | { getBoundingClientRect(): DOMRect; contextElement?: Element };

/** Element whose scroll / resize ancestors keep the floating part in place, if any. */
function contextOf(reference: FloatingReference): Element | undefined {
	return reference instanceof Element ? reference : reference.contextElement;
}

/**
 * Keep `floating` positioned next to `reference` (fixed strategy) and expose the
 * resolved side as `data-side`. Returns a cleanup; use inside an `$effect`.
 */
export function float(
	reference: FloatingReference,
	floating: HTMLElement,
	placement: Placement = 'top',
	gap = 8,
	{ clamp = false, boundary }: { clamp?: boolean; boundary?: Element } = {}
): () => void {
	// `boundary`: the area the part must fit in (e.g. the pages' scroller, so it never
	// covers the app's toolbars); the window by default.
	const area = boundary ? { boundary } : {};
	const update = () =>
		computePosition(reference, floating, {
			placement,
			strategy: 'fixed',
			// `clamp`: when neither side fits (a reference taller than the area), keep the
			// part inside the area rather than past its edge.
			middleware: [
				offset(gap),
				flip({ padding: 8, ...area }),
				shift({ padding: 8, crossAxis: clamp, ...area })
			]
		}).then(({ x, y, placement: p }) => {
			floating.style.left = `${x}px`;
			floating.style.top = `${y}px`;
			floating.dataset.side = p.split('-')[0];
		});
	// Without a context element nothing can move the reference: position once.
	if (!contextOf(reference)) {
		update();
		return () => {};
	}
	return autoUpdate(reference, floating, update);
}

/** A virtual reference from a rect getter (e.g. a text selection). */
export function virtualRef(getRect: () => DOMRect, contextElement?: Element): FloatingReference {
	return { getBoundingClientRect: getRect, contextElement };
}
