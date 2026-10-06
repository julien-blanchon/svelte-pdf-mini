/**
 * Selection steering for text layers (ported from pdf.js's TextLayerBuilder).
 *
 * A text layer is a box of absolutely positioned spans. Dragging a selection over
 * the gaps between them (between lines, before a paragraph) leaves the pointer on
 * the layer itself, and WebKit then extends the selection to the layer's start or
 * end: it jumps to the whole page and back (WebKit bug 307340). While selecting,
 * each layer's `.endOfContent` covers the page (styles.css); here it also moves
 * right next to the selection's moving end, so those gaps resolve beside it.
 */

const layers = new Map<HTMLElement, HTMLElement>();
/** Layers whose end element moved or that are marked `selecting`: the ones to reset. */
const dirty = new Set<HTMLElement>();
let previous: Range | null = null;
/** Steering only happens during a pointer drag (keyboard selections don't hit gaps). */
let dragging = false;
let teardown: (() => void) | null = null;

/** Steer selections in `layer` with its end-of-content element; returns the cleanup. */
export function steerSelection(layer: HTMLElement, end: HTMLElement): () => void {
	layers.set(layer, end);
	teardown ??= listen();
	return () => {
		layers.delete(layer);
		dirty.delete(layer);
		if (!layers.size) {
			teardown?.();
			teardown = null;
			previous = null;
			dragging = false;
		}
	};
}

function reset(layer: HTMLElement) {
	const end = layers.get(layer);
	if (end) {
		layer.append(end);
		end.style.width = end.style.height = end.style.userSelect = '';
	}
	layer.classList.remove('selecting');
	dirty.delete(layer);
}

function resetAll() {
	for (const layer of [...dirty]) reset(layer);
	previous = null;
}

/** Put the end element before `before` in `parent`, covering the page and selectable. */
function placeEnd(layer: HTMLElement, end: HTMLElement, parent: Node, before: Node | null) {
	end.style.width = layer.style.width;
	end.style.height = layer.style.height;
	end.style.userSelect = 'text';
	parent.insertBefore(end, before);
	layer.classList.add('selecting');
	dirty.add(layer);
}

const onDown = (e: PointerEvent) => {
	if (e.button !== 0) return;
	dragging = true;
	const layer = (e.target as Element | null)?.closest?.<HTMLElement>('[data-pdf-text-layer]');
	if (!layer || !layers.has(layer)) return;
	// From the first press the end element covers the page (styles.css `.selecting`).
	layer.classList.add('selecting');
	dirty.add(layer);
	anchorAtPointer(e, layer);
};

const onUp = () => {
	dragging = false;
	resetAll();
};

/**
 * A press in a gap (on the layer or its end element, not on text): WebKit anchors the
 * selection wherever the end element sits, by default the end of the page. Move it
 * just before the nearest text at or after the pointer in reading order, so the
 * selection starts where the drag enters the text (as in Chromium).
 */
export function anchorAtPointer(
	e: { target: EventTarget | null; clientX: number; clientY: number },
	layer: HTMLElement
) {
	const end = layers.get(layer);
	if (!end || (e.target !== layer && e.target !== end)) return;
	let best: Element | null = null;
	let bestScore = Infinity;
	for (const span of layer.querySelectorAll<HTMLElement>('span[data-idx]')) {
		const r = span.getBoundingClientRect();
		if (!r.width || r.bottom < e.clientY) continue; // above the pointer
		// Lines below count by their distance; on the pointer's own line, the text after
		// it in reading order (to its right, or to its left in right-to-left text).
		const rtl = span.dir === 'rtl';
		const sameLine = r.top <= e.clientY;
		if (sameLine && (rtl ? r.left > e.clientX : r.right < e.clientX)) continue;
		const ahead = rtl ? e.clientX - r.right : r.left - e.clientX;
		const score = sameLine
			? Math.max(0, ahead)
			: 1e4 + (r.top - e.clientY) * 10 + Math.abs(r.left - e.clientX) / 10;
		if (score < bestScore) [best, bestScore] = [span, score];
	}
	if (best?.parentElement) placeEnd(layer, end, best.parentElement, best);
}

function onSelectionChange() {
	if (!dragging) return;
	const selection = document.getSelection();
	if (!selection || selection.rangeCount === 0) return resetAll();
	// Layers the selection left go back to rest (as in pdf.js).
	const active = new Set([...layers.keys()].filter((l) => selection.containsNode(l, true)));
	for (const layer of [...dirty]) if (!active.has(layer)) reset(layer);
	if (!active.size) {
		previous = null;
		return;
	}

	const range = selection.getRangeAt(0);
	// Which end moves: dragging backwards changes the start, forwards the end.
	const modifyStart =
		previous !== null &&
		(range.compareBoundaryPoints(Range.END_TO_END, previous) === 0 ||
			range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
	let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
	if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
	// The end at offset 0 of a node belongs to the previous one with content.
	if (!modifyStart && range.endOffset === 0) {
		do {
			while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
			anchor = anchor?.previousSibling ?? null;
		} while (anchor && !anchor.childNodes.length);
	}
	const parent = anchor?.parentElement;
	const layer = parent?.closest<HTMLElement>('[data-pdf-text-layer]');
	const end = layer && layers.get(layer);
	if (anchor && parent && layer && end && anchor !== end)
		placeEnd(layer, end, parent, modifyStart ? anchor : anchor.nextSibling);
	previous = range.cloneRange();
}

function listen() {
	document.addEventListener('pointerdown', onDown, true);
	document.addEventListener('selectionchange', onSelectionChange);
	document.addEventListener('pointerup', onUp);
	// A touch pan cancels the pointer (no pointerup).
	document.addEventListener('pointercancel', onUp);
	window.addEventListener('blur', onUp);
	return () => {
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('selectionchange', onSelectionChange);
		document.removeEventListener('pointerup', onUp);
		document.removeEventListener('pointercancel', onUp);
		window.removeEventListener('blur', onUp);
	};
}
