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
		if (!layers.size) {
			teardown?.();
			teardown = null;
		}
	};
}

function reset(layer: HTMLElement, end: HTMLElement) {
	layer.append(end);
	end.style.width = end.style.height = end.style.userSelect = '';
	layer.classList.remove('selecting');
}

function resetAll() {
	for (const [layer, end] of layers) reset(layer, end);
	previous = null;
}

const onDown = (e: PointerEvent) => {
	if (e.button === 0) dragging = true;
};
const onUp = () => {
	dragging = false;
	resetAll();
};

function onSelectionChange() {
	if (!dragging) return;
	const selection = document.getSelection();
	if (!selection || selection.rangeCount === 0) return resetAll();
	// Only while a selection is being made in one of our layers.
	const active = [...layers.keys()].filter((l) => selection.containsNode(l, true));
	if (!active.length) return resetAll();
	for (const layer of active) layer.classList.add('selecting');

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
	if (anchor && parent && end && anchor !== end) {
		end.style.width = layer.style.width;
		end.style.height = layer.style.height;
		end.style.userSelect = 'text';
		parent.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
	}
	previous = range.cloneRange();
}

function listen() {
	document.addEventListener('pointerdown', onDown, true);
	document.addEventListener('selectionchange', onSelectionChange);
	document.addEventListener('pointerup', onUp);
	window.addEventListener('blur', onUp);
	return () => {
		document.removeEventListener('pointerdown', onDown, true);
		document.removeEventListener('selectionchange', onSelectionChange);
		document.removeEventListener('pointerup', onUp);
		window.removeEventListener('blur', onUp);
	};
}
