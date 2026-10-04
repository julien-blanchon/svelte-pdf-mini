import { clamp } from '../../core/view/geometry.js';

/** Scroll position that brings a target span into view with the given alignment. */
export function alignScroll(
	align: string,
	targetStart: number,
	targetSize: number,
	viewSize: number,
	current: number,
	offset: number,
	startOffset: number
) {
	switch (align) {
		case 'center':
			return targetStart + targetSize / 2 - viewSize / 2;
		case 'end':
			return targetStart + targetSize - viewSize + offset;
		case 'nearest':
			if (targetStart - offset < current) return targetStart - offset;
			if (targetStart + targetSize + offset > current + viewSize)
				return targetStart + targetSize + offset - viewSize;
			return current;
		default:
			return targetStart - startOffset;
	}
}

export function prefersReducedMotion() {
	return (
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Scroll and resolve when the scroll settles (scrollend, or immediately if nothing moves). */
export function scrollAndWait(
	el: HTMLElement,
	opts: { top: number; left: number; behavior: ScrollBehavior }
) {
	const top = clamp(opts.top, 0, el.scrollHeight - el.clientHeight);
	const left = clamp(opts.left, 0, el.scrollWidth - el.clientWidth);
	if (Math.abs(el.scrollTop - top) < 1 && Math.abs(el.scrollLeft - left) < 1)
		return Promise.resolve();
	return new Promise<void>((resolve) => {
		const done = () => {
			clearTimeout(timer);
			el.removeEventListener('scrollend', done);
			resolve();
		};
		const timer = setTimeout(done, opts.behavior === 'smooth' ? 1500 : 100);
		el.addEventListener('scrollend', done);
		el.scrollTo({ top, left, behavior: opts.behavior });
	});
}
