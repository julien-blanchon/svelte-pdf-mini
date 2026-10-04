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
	gap = 8
): () => void {
	const update = () =>
		computePosition(reference, floating, {
			placement,
			strategy: 'fixed',
			middleware: [offset(gap), flip({ padding: 8 }), shift({ padding: 8 })]
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
