/**
 * Floating parts (menus, popovers, previews) are tied to what they point at with CSS
 * anchor positioning: the browser moves them with the pages as they scroll, in the same
 * frame (on the compositor), where a scroll listener always trails a frame behind.
 */

export type Side = 'top' | 'bottom' | 'left' | 'right';

/** What a floating part points at: an element, or a client box (e.g. a text selection). */
export type FloatingReference = Element | DOMRect;

export interface FloatOptions {
	/** Pages' scroller holding a client-box reference. */
	scroller?: Element | null;
	/**
	 * Area the part must fit in (e.g. the pages' scroller, so it never covers the app's
	 * toolbars): it takes the other side, else sits just inside the reference, when its
	 * side has no room there. The window by default.
	 */
	boundary?: Element | null;
}

/** Space kept between a part and the edges of its area (px). */
const PADDING = 8;
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const PAGE = '[data-pdf-page]';
let count = 0;

/**
 * Keep `floating` (a `position: fixed` element) on `side` of `reference`, `gap` px away,
 * on the other side when there is no room, and hidden while the reference is scrolled
 * out of view (unless it holds the focus). Returns a cleanup; use inside an `$effect`.
 */
export function float(
	reference: FloatingReference,
	floating: HTMLElement,
	side: Side = 'top',
	gap = 8,
	{ scroller, boundary }: FloatOptions = {}
): () => void {
	const style = floating.style;
	const target = anchorTarget(reference, scroller);
	if (!target) {
		style.setProperty('visibility', 'hidden');
		return () => style.removeProperty('visibility');
	}
	const name = `--pdf-anchor-${++count}`;
	const cleanups = [addName(target, name)];
	if (target !== reference) cleanups.push(() => target.remove());
	cleanups.push(() => {
		for (const p of PROPERTIES) style.removeProperty(p);
	});
	style.setProperty('position-anchor', name);
	const viewport = target.closest('[data-pdf-viewport]');

	/** Place on side `s` (or just inside the reference's top), within `area`'s padding. */
	const place = (s: Side | 'inside', area: Insets) => {
		const facing = s === 'inside' ? null : OPPOSITE[s];
		// Across the reference's row (or column), centered on it, and kept inside the
		// area when it can't be centered.
		style.setProperty('position-area', s === 'inside' ? 'center span-all' : `${s} span-all`);
		style.setProperty('align-self', s === 'inside' ? 'start' : '');
		style.setProperty('margin', s === 'inside' ? `${PADDING}px 0 0` : '0');
		if (facing) style.setProperty(`margin-${facing}`, `${gap}px`);
		// Insets shrink the area; the edge facing the reference keeps none (the margin is the gap).
		for (const edge of EDGES) {
			const along = s === 'inside' && (edge === 'top' || edge === 'bottom');
			style.setProperty(edge, edge === facing || along ? '0' : `${area[edge]}px`);
		}
	};

	if (boundary) {
		// The browsers only flip against the window while the pages scroll (Chrome doesn't
		// count insets): pick the side here, from the room within the boundary.
		let current: Side | 'inside' | undefined;
		const update = (force = false) => {
			const s = pickSide(target.getBoundingClientRect(), floating, boundary, side, gap);
			if (s === current && !force) return;
			current = s;
			place(s, insetsOf(boundary));
		};
		update();
		const onScroll = () => update();
		const ro = new ResizeObserver(() => update(true));
		ro.observe(boundary);
		ro.observe(floating);
		viewport?.addEventListener('scroll', onScroll, { passive: true });
		cleanups.push(() => {
			ro.disconnect();
			viewport?.removeEventListener('scroll', onScroll);
		});
	} else {
		place(side, { top: PADDING, bottom: PADDING, left: PADDING, right: PADDING });
		style.setProperty(
			'position-try-fallbacks',
			side === 'top' || side === 'bottom' ? 'flip-block' : 'flip-inline'
		);
	}

	// Hidden while the reference is scrolled out of the pages' view (Chrome's
	// `position-visibility: anchors-visible` would hide a part being typed in, and Safari
	// only checks the window). A part holding the focus stays.
	if (viewport) {
		let out = false;
		const apply = () => {
			if (out && !floating.contains(document.activeElement))
				style.setProperty('visibility', 'hidden');
			else style.removeProperty('visibility');
		};
		const io = new IntersectionObserver(
			([entry]) => {
				out = !entry.isIntersecting;
				apply();
			},
			{ root: viewport }
		);
		io.observe(target);
		floating.addEventListener('focusout', apply);
		cleanups.push(() => {
			io.disconnect();
			floating.removeEventListener('focusout', apply);
		});
	}

	return () => {
		for (const fn of cleanups.reverse()) fn();
	};
}

type Insets = Record<(typeof EDGES)[number], number>;
const EDGES = ['top', 'bottom', 'left', 'right'] as const;
/** Inline properties set by `float`. */
const PROPERTIES = [
	'position-anchor',
	'position-area',
	'position-try-fallbacks',
	'align-self',
	'margin',
	...EDGES,
	'visibility'
];

/** Insets keeping a fixed part within `el` (with the padding). */
function insetsOf(el: Element): Insets {
	const b = el.getBoundingClientRect();
	const { clientWidth: vw, clientHeight: vh } = document.documentElement;
	return {
		top: Math.max(0, b.top) + PADDING,
		bottom: Math.max(0, vh - b.bottom) + PADDING,
		left: Math.max(0, b.left) + PADDING,
		right: Math.max(0, vw - b.right) + PADDING
	};
}

/**
 * An element the browser can anchor to: the reference itself when it has a CSS box,
 * else an empty box placed over it, inside its page (so it follows the page through
 * scrolling, zoom and relayout).
 */
function anchorTarget(reference: FloatingReference, scroller?: Element | null): HTMLElement | null {
	if (reference instanceof HTMLElement) return reference;
	const rect = reference instanceof Element ? reference.getBoundingClientRect() : reference;
	const page =
		reference instanceof Element ? reference.closest<HTMLElement>(PAGE) : pageUnder(rect, scroller);
	if (!page || !rect.width || !rect.height) return null;
	const box = page.getBoundingClientRect();
	const w = page.clientWidth || box.width;
	const h = page.clientHeight || box.height;
	const left = box.left + page.clientLeft;
	const top = box.top + page.clientTop;
	const pin = document.createElement('div');
	pin.dataset.pdfFloatingAnchor = '';
	pin.setAttribute('aria-hidden', 'true');
	// In page percentages: stays on the content when the page is zoomed.
	pin.style.cssText =
		`position:absolute;pointer-events:none;` +
		`left:${((rect.left - left) / w) * 100}%;top:${((rect.top - top) / h) * 100}%;` +
		`width:${(rect.width / w) * 100}%;height:${(rect.height / h) * 100}%;`;
	page.append(pin);
	return pin;
}

/** The page under most of `rect`. */
function pageUnder(rect: DOMRect, scroller?: Element | null): HTMLElement | null {
	let best: HTMLElement | null = null;
	let most = 0;
	for (const page of scroller?.querySelectorAll<HTMLElement>(PAGE) ?? []) {
		const r = page.getBoundingClientRect();
		const w = Math.min(rect.right, r.right) - Math.max(rect.left, r.left);
		const h = Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top);
		const area = Math.max(0, w) * Math.max(0, h);
		if (area > most) [best, most] = [page, area];
	}
	return best;
}

/** Add `name` to the element's anchor names; returns its removal. */
function addName(el: HTMLElement, name: string): () => void {
	const names = () =>
		el.style
			.getPropertyValue('anchor-name')
			.split(',')
			.map((n) => n.trim())
			.filter((n) => n && n !== 'none');
	el.style.setProperty('anchor-name', [...names(), name].join(', '));
	return () => {
		const rest = names().filter((n) => n !== name);
		if (rest.length) el.style.setProperty('anchor-name', rest.join(', '));
		else el.style.removeProperty('anchor-name');
	};
}

/** The side with room for `floating` within `boundary`: `side`, its opposite, else inside. */
function pickSide(
	ref: DOMRect,
	floating: HTMLElement,
	boundary: Element,
	side: Side,
	gap: number
): Side | 'inside' {
	const b = boundary.getBoundingClientRect();
	const room: Record<Side, number> = {
		top: ref.top - b.top,
		bottom: b.bottom - ref.bottom,
		left: ref.left - b.left,
		right: b.right - ref.right
	};
	const size = side === 'top' || side === 'bottom' ? floating.offsetHeight : floating.offsetWidth;
	const fits = (s: Side) => room[s] >= size + gap + PADDING;
	if (fits(side)) return side;
	if (fits(OPPOSITE[side])) return OPPOSITE[side];
	return 'inside';
}
