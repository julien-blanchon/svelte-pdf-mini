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
	/** Client rect of the selection end (anchor for floating menus). */
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
			scroller.addEventListener('copy', onCopy);
			return () => {
				cancelAnimationFrame(this.#raf);
				document.removeEventListener('selectionchange', onChange);
				scroller.removeEventListener('pointerdown', onDown);
				scroller.removeEventListener('mousedown', onMouseDown);
				document.removeEventListener('pointerup', onUp);
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
		const rects = range.getClientRects();
		this.anchorRect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
	}
}

const ITEM_SPAN = 'span[data-idx]';

/** The text-item span that is `el` or the first one inside it. */
function itemSpanIn(el: HTMLElement): HTMLElement | null {
	return el.matches(ITEM_SPAN) ? el : el.querySelector<HTMLElement>(ITEM_SPAN);
}

/** Raw offset for a DOM (node, offset) boundary inside a text layer. */
function offsetIn(
	layer: HTMLElement,
	text: { itemStart: number[]; items: { str: string }[]; length: number },
	node: Node,
	offset: number,
	isEnd: boolean
): number | null {
	const spanOf = (n: Node | null) =>
		(n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>(ITEM_SPAN);
	if (node.nodeType === Node.TEXT_NODE) {
		const span = spanOf(node);
		if (!span) return null;
		const i = Number(span.dataset.idx);
		return text.itemStart[i] + Math.min(offset, text.items[i]?.str.length ?? 0);
	}
	// Element boundary: look at the child at/before the offset.
	const el = node as Element;
	if (el === layer || el.classList?.contains('markedContent')) {
		const child = el.childNodes[offset] ?? null;
		const prev = el.childNodes[offset - 1] ?? null;
		const pick = isEnd ? (prev ?? child) : (child ?? prev);
		const span = pick instanceof HTMLElement ? itemSpanIn(pick) : null;
		if (!span) return isEnd ? text.length : 0;
		const i = Number(span.dataset.idx);
		const atEnd = isEnd ? pick === prev : pick !== child;
		return text.itemStart[i] + (atEnd ? (text.items[i]?.str.length ?? 0) : 0);
	}
	const span = spanOf(el);
	if (!span) return null;
	const i = Number(span.dataset.idx);
	return text.itemStart[i] + (offset > 0 ? (text.items[i]?.str.length ?? 0) : 0);
}

/** DOM boundary for (item, char) in a text layer. */
function locate(layer: HTMLElement, item: number, char: number) {
	const span = layer.querySelector<HTMLElement>(`span[data-idx="${item}"]`);
	const node = span?.firstChild;
	if (!node) return null;
	return { node, offset: Math.max(0, Math.min(char, node.textContent?.length ?? 0)) };
}
