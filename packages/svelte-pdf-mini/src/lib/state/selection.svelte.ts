import { untrack } from 'svelte';
import type { Quad } from '../core/text/text-index.js';
import { cleanQuote, quadsBounds } from '../core/text/text-index.js';
import type { PdfRect } from '../core/types.js';
import type { ViewerState } from './viewer.svelte.js';
import { copyText, hasCustomClipboard } from '../core/document/clipboard.js';

/** The selected text on one page. Offsets are raw page-text offsets. */
export interface PageSelection {
	page: number;
	start: number;
	end: number;
	text: string;
	quads: Quad[];
	rect: PdfRect | null;
}

/**
 * Tracks the browser text selection inside a viewer and maps it to the text
 * index: per-page ranges, quads (PDF space) and clean text. Also cleans up
 * copied text (joins lines, removes line-end hyphens).
 */
export class TextSelectionState {
	/** Current selection, one entry per page it spans. */
	ranges = $state.raw<PageSelection[]>([]);
	/** Clicks of the gesture that made the selection: 1 drag, 2 word, 3 line. */
	clicks = 1;
	/** Client box of the selected text, within the visible view (anchor for floating menus). */
	anchorRect = $state.raw<DOMRect | null>(null);
	/** True while the pointer is down (selection still changing). */
	selecting = $state(false);
	readonly text = $derived(this.ranges.map((r) => r.text).join('\n'));
	readonly isEmpty = $derived(this.ranges.length === 0);

	#viewer: ViewerState;
	#raf = 0;

	constructor(viewer: ViewerState) {
		this.#viewer = viewer;
		// The selection moved with the zoom: re-measure it once the zoom settles.
		let wasZooming = false;
		$effect(() => {
			const zooming = viewer.isZooming;
			if (wasZooming && !zooming && untrack(() => this.ranges.length)) this.refresh();
			wasZooming = zooming;
		});
		$effect(() => {
			const scroller = viewer.scrollEl;
			if (!scroller) return;
			const onChange = () => {
				cancelAnimationFrame(this.#raf);
				this.#raf = requestAnimationFrame(() => this.#update());
			};
			const onDown = (e: PointerEvent) => {
				if (e.button === 0) this.selecting = true;
			};
			// Click count of the gesture that made the selection (2: word, 3: line).
			const onMouseDown = (e: MouseEvent) => {
				if (e.button === 0) this.clicks = e.detail;
			};
			const onUp = () => {
				if (!this.selecting) return;
				this.selecting = false;
				onChange();
			};
			const onCopy = (e: ClipboardEvent) => {
				if (!this.ranges.length) return;
				if (hasCustomClipboard()) void copyText(this.text);
				else if (e.clipboardData) e.clipboardData.setData('text/plain', this.text);
				else return;
				e.preventDefault();
			};
			document.addEventListener('selectionchange', onChange);
			scroller.addEventListener('pointerdown', onDown);
			scroller.addEventListener('mousedown', onMouseDown);
			document.addEventListener('pointerup', onUp);
			// A touch pan cancels the pointer (no pointerup): the drag is over all the same.
			document.addEventListener('pointercancel', onUp);
			scroller.addEventListener('copy', onCopy);
			return () => {
				cancelAnimationFrame(this.#raf);
				document.removeEventListener('selectionchange', onChange);
				scroller.removeEventListener('pointerdown', onDown);
				scroller.removeEventListener('mousedown', onMouseDown);
				document.removeEventListener('pointerup', onUp);
				document.removeEventListener('pointercancel', onUp);
				scroller.removeEventListener('copy', onCopy);
			};
		});
	}

	/** Recompute now (instead of on the next frame), e.g. right before reading it. */
	refresh() {
		cancelAnimationFrame(this.#raf);
		this.#update();
	}

	#schedule() {
		cancelAnimationFrame(this.#raf);
		this.#raf = requestAnimationFrame(() => this.#update());
	}

	/** Clear the browser selection. */
	clear() {
		globalThis.getSelection?.()?.removeAllRanges();
		this.ranges = [];
		this.anchorRect = null;
	}

	/** Programmatically select a raw range on a page (e.g. a search hit). */
	select(page: number, start: number, end: number) {
		const layer = this.#viewer.scrollEl?.querySelector<HTMLElement>(
			`[data-pdf-page="${page}"] [data-pdf-text-layer]`
		);
		const text = this.#viewer.document.pageTextSync(page);
		if (!layer || !text) return;
		const a = locate(layer, text.itemAt(start), start - text.itemStart[text.itemAt(start)]);
		const b = locate(layer, text.itemAt(end - 1), end - text.itemStart[text.itemAt(end - 1)]);
		if (!a || !b) return;
		const range = document.createRange();
		range.setStart(a.node, a.offset);
		range.setEnd(b.node, b.offset);
		const sel = getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	#update() {
		const scroller = this.#viewer.scrollEl;
		const sel = globalThis.getSelection?.();
		if (!scroller || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
			if (this.ranges.length) this.ranges = [];
			this.anchorRect = null;
			return;
		}
		const range = sel.getRangeAt(0);
		if (!scroller.contains(range.commonAncestorContainer)) {
			if (this.ranges.length) this.ranges = [];
			this.anchorRect = null;
			return;
		}
		const out: PageSelection[] = [];
		for (const layer of scroller.querySelectorAll<HTMLElement>('[data-pdf-text-layer]')) {
			if (!range.intersectsNode(layer)) continue;
			const page = Number(layer.closest<HTMLElement>('[data-pdf-page]')?.dataset.pdfPage);
			const text = this.#viewer.document.pageTextSync(page);
			if (!page) continue;
			if (!text) {
				// The page's text index is still being built: recompute once it is ready.
				this.#viewer.document.getPageText(page).then(
					() => this.#schedule(),
					() => {}
				);
				continue;
			}
			const start = layer.contains(range.startContainer)
				? offsetIn(layer, text, range.startContainer, range.startOffset, false)
				: 0;
			const end = layer.contains(range.endContainer)
				? offsetIn(layer, text, range.endContainer, range.endOffset, true)
				: text.length;
			if (start == null || end == null || end <= start) continue;
			const quads = text.quadsFor(start, end);
			if (!quads.length) continue;
			out.push({
				page,
				start,
				end,
				text: cleanQuote(text.raw.slice(start, end)),
				quads,
				rect: quadsBounds(quads)
			});
		}
		this.ranges = out;
		// Only the floating parts read the box, and they wait for the drag to end (the
		// release re-measures): skip the layout work while selecting.
		this.anchorRect = this.selecting ? null : selectionBounds(range, scroller);
	}
}

/**
 * Screen box of the selected characters, within the visible part of `scroller`.
 * Built from the text nodes of the text layer only: a range's own client rects
 * also include whole spans and pdf.js's oversized end-of-content element.
 */
function selectionBounds(range: Range, scroller: HTMLElement): DOMRect {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	const root = range.commonAncestorContainer;
	const walker = document.createTreeWalker(
		root.nodeType === Node.TEXT_NODE ? (root.parentNode ?? root) : root,
		NodeFilter.SHOW_TEXT
	);
	const part = document.createRange();
	// Walk the selected text only: from its start to its end, whatever the pages around it.
	const start = range.startContainer;
	walker.currentNode = start;
	const first = start.nodeType === Node.TEXT_NODE ? start : walker.nextNode();
	for (let n = first; n; n = walker.nextNode()) {
		if (range.comparePoint(n, 0) > 0) break; // past the end
		if (!range.intersectsNode(n) || !n.parentElement?.closest(ITEM_SPAN)) continue;
		const len = n.textContent?.length ?? 0;
		part.setStart(n, n === range.startContainer ? range.startOffset : 0);
		part.setEnd(n, n === range.endContainer ? range.endOffset : len);
		for (const r of part.getClientRects()) {
			if (!r.width || !r.height) continue;
			left = Math.min(left, r.left);
			top = Math.min(top, r.top);
			right = Math.max(right, r.right);
			bottom = Math.max(bottom, r.bottom);
		}
	}
	const box =
		left < right
			? new DOMRect(left, top, right - left, bottom - top)
			: range.getBoundingClientRect();
	// Only what can be seen counts: a selection running past the view anchors to its visible part.
	const view = scroller.getBoundingClientRect();
	const t = Math.max(box.top, view.top);
	const b = Math.min(box.bottom, view.bottom);
	const l = Math.max(box.left, view.left);
	const r = Math.min(box.right, view.right);
	return b > t && r > l ? new DOMRect(l, t, r - l, b - t) : box;
}

const ITEM_SPAN = 'span[data-idx]';

/** Raw offset for a DOM (node, offset) boundary inside a text layer. */
export function offsetIn(
	layer: HTMLElement,
	text: { itemStart: number[]; items: { str: string }[]; length: number },
	node: Node,
	offset: number,
	isEnd: boolean
): number | null {
	// Inside a text item: that item, up to the boundary.
	const inItem = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(
		ITEM_SPAN
	);
	if (inItem && layer.contains(inItem)) {
		const i = Number(inItem.dataset.idx);
		const len = text.items[i]?.str.length ?? 0;
		if (node.nodeType === Node.TEXT_NODE) return text.itemStart[i] + Math.min(offset, len);
		return text.itemStart[i] + (offset > 0 ? len : 0);
	}
	// Between items (the layer, a marked-content group, or the end-of-content element
	// that selection steering moves among them): the nearest item in document order.
	if (!layer.contains(node)) return null;
	const at = document.createRange();
	at.setStart(node, offset);
	const spans = layer.querySelectorAll<HTMLElement>(ITEM_SPAN);
	// First item at or after the boundary (items keep document order).
	let lo = 0;
	let hi = spans.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (at.comparePoint(spans[mid], 0) < 0) lo = mid + 1;
		else hi = mid;
	}
	if (isEnd) {
		const prev = spans[lo - 1];
		if (!prev) return 0;
		const i = Number(prev.dataset.idx);
		return text.itemStart[i] + (text.items[i]?.str.length ?? 0);
	}
	const next = spans[lo];
	return next ? text.itemStart[Number(next.dataset.idx)] : text.length;
}

/** DOM boundary for (item, char) in a text layer. */
function locate(layer: HTMLElement, item: number, char: number) {
	const span = layer.querySelector<HTMLElement>(`span[data-idx="${item}"]`);
	const node = span?.firstChild;
	if (!node) return null;
	return { node, offset: Math.max(0, Math.min(char, node.textContent?.length ?? 0)) };
}
