import { afterEach, describe, expect, it } from 'vitest';
import { offsetIn } from './selection.svelte.js';
import { anchorAtPointer, steerSelection } from './text-selection.js';

/** A text layer like pdf.js's: one absolutely positioned span per item, plus the end element. */
function layer(lines: string[][], { rtl = false } = {}) {
	const root = document.createElement('div');
	root.setAttribute('data-pdf-text-layer', '');
	root.style.cssText = 'position:relative;width:400px;height:300px;font:16px/20px sans-serif;';
	const items: { str: string }[] = [];
	let y = 10;
	for (const line of lines) {
		let x = rtl ? 380 : 10;
		for (const str of line) {
			const span = document.createElement('span');
			span.textContent = str;
			span.dataset.idx = String(items.length);
			if (rtl) span.dir = 'rtl';
			span.style.cssText = `position:absolute;top:${y}px;white-space:pre;`;
			root.append(span);
			const w = span.getBoundingClientRect().width || str.length * 8;
			span.style[rtl ? 'right' : 'left'] = `${rtl ? 400 - x : x}px`;
			x += rtl ? -(w + 10) : w + 10;
			items.push({ str });
		}
		y += 40;
	}
	const end = document.createElement('div');
	end.className = 'endOfContent';
	root.append(end);
	document.body.append(root);
	const itemStart: number[] = [];
	let n = 0;
	for (const it of items) {
		itemStart.push(n);
		n += it.str.length;
	}
	return { root, end, text: { itemStart, items, length: n } };
}

const spans = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('span[data-idx]')];

afterEach(() => document.body.replaceChildren());

describe('offsetIn with the end element moved among the items', () => {
	it('maps boundaries on or around the end element to the nearest items', () => {
		const { root, end, text } = layer([['alpha', 'beta'], ['gamma']]);
		const [, beta] = spans(root);
		root.insertBefore(end, beta); // steering moved it between alpha and beta
		// (end, 0): a start resolves to beta's start, an end to alpha's end.
		expect(offsetIn(root, text, end, 0, false)).toBe(text.itemStart[1]);
		expect(offsetIn(root, text, end, 0, true)).toBe(text.itemStart[0] + 5);
		// (layer, index right after end): same.
		const after = [...root.childNodes].indexOf(end) + 1;
		expect(offsetIn(root, text, root, after, false)).toBe(text.itemStart[1]);
		expect(offsetIn(root, text, root, after, true)).toBe(text.itemStart[0] + 5);
	});

	it('still maps text nodes and the layer edges', () => {
		const { root, text } = layer([['alpha', 'beta']]);
		const beta = spans(root)[1];
		expect(offsetIn(root, text, beta.firstChild!, 2, false)).toBe(text.itemStart[1] + 2);
		expect(offsetIn(root, text, root, 0, false)).toBe(0);
		expect(offsetIn(root, text, root, root.childNodes.length, true)).toBe(text.length);
	});
});

describe('selection steering', () => {
	it('a press in a gap puts the end element before the nearest text below', () => {
		const { root, end } = layer([['first line'], ['second line']]);
		const stop = steerSelection(root, end);
		const [, second] = spans(root);
		const r = second.getBoundingClientRect();
		anchorAtPointer({ target: root, clientX: r.left + 5, clientY: r.top - 8 }, root);
		expect(end.nextSibling).toBe(second);
		expect(root.classList.contains('selecting')).toBe(true);
		stop();
	});

	it('on the pointer line, picks the text after it (to the left in right-to-left text)', () => {
		const { root, end } = layer([['שלום', 'עולם']], { rtl: true });
		const stop = steerSelection(root, end);
		const [first, second] = spans(root);
		const a = first.getBoundingClientRect();
		const b = second.getBoundingClientRect();
		// Between the two words (rtl: the second is on the left).
		anchorAtPointer({ target: root, clientX: (a.left + b.right) / 2, clientY: a.top + 4 }, root);
		expect(end.nextSibling).toBe(second);
		stop();
	});

	it('a press on text does not move the end element', () => {
		const { root, end } = layer([['first line']]);
		const stop = steerSelection(root, end);
		const [first] = spans(root);
		anchorAtPointer({ target: first, clientX: 0, clientY: 0 }, root);
		expect(root.lastChild).toBe(end);
		stop();
	});

	it('the release puts the end element back and clears `selecting`', () => {
		const { root, end } = layer([['first line'], ['second line']]);
		const stop = steerSelection(root, end);
		const [, second] = spans(root);
		const r = second.getBoundingClientRect();
		root.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				button: 0,
				clientX: r.left + 5,
				clientY: r.top - 8
			})
		);
		expect(end.nextSibling).toBe(second);
		document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
		expect(root.lastChild).toBe(end);
		expect(end.style.userSelect).toBe('');
		expect(root.classList.contains('selecting')).toBe(false);
		stop();
	});
});
