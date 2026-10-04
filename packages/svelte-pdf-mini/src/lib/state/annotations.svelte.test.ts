import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { Annotation } from '../core/annotations/model.js';
import { hitStack } from '../core/annotations/geometry.js';
import { renderMarkdown } from '../internal/markdown.js';
import { defaultKeymap } from '../core/i18n/keymap.js';
import { AnnotationStore } from './annotations.svelte.js';
import type { ViewerState } from './viewer.svelte.js';

/** Just enough of a viewer for the store. */
function fakeViewer() {
	return {
		scrollEl: null,
		selection: { selecting: false, isEmpty: true, ranges: [], clear() {} },
		document: { proxy: null, pageTextSync: () => undefined },
		hideNativeAnnotations: false,
		keymap: defaultKeymap,
		addContextResolver: () => () => {},
		t: (k: string) => k
	} as unknown as ViewerState;
}

function setup() {
	let store!: AnnotationStore;
	const cleanup = $effect.root(() => {
		store = new AnnotationStore({ viewer: fakeViewer() });
	});
	flushSync();
	return { store, cleanup };
}

const key = (k: string, code = '', init: KeyboardEventInit = {}) =>
	new KeyboardEvent('keydown', { key: k, code, cancelable: true, ...init });

describe('AnnotationStore workflow', () => {
	it('new annotations are pending: Esc discards without an undo step, tool returns to select', () => {
		const { store, cleanup } = setup();
		store.tool = 'area';
		const a = store.create('area', { page: 1, rect: [10, 10, 100, 100] })!;
		expect(store.pendingId).toBe(a.id);
		expect(store.tool).toBe('select');
		expect(store.handleNoteKey(key('Escape'), a)).toBe(true);
		expect(store.annotations).toHaveLength(0);
		expect(store.canUndo).toBe(false);
		cleanup();
	});

	it('digits recolour and Backspace discards only while the note is pristine', () => {
		const { store, cleanup } = setup();
		const a = store.create('area', { page: 1, rect: [10, 10, 100, 100] })!;
		expect(store.handleNoteKey(key('2', 'Digit2'), a)).toBe(true);
		expect(store.byId.get(a.id)!.paletteKey).toBe(store.palette[1].key);
		store.markTyped(a.id);
		expect(store.handleNoteKey(key('3', 'Digit3'), a)).toBe(false); // types normally now
		expect(store.handleNoteKey(key('Backspace', 'Backspace'), a)).toBe(false);
		expect(store.handleNoteKey(key('3', 'Digit3', { altKey: true }), a)).toBe(true); // Alt always recolours
		expect(store.handleNoteKey(key('Enter', 'Enter'), a)).toBe(true);
		expect(store.pendingId).toBeNull();
		expect(store.annotations).toHaveLength(1);
		cleanup();
	});

	it('Backspace on a pristine pending note discards it', () => {
		const { store, cleanup } = setup();
		const a = store.create('note', { page: 1, rect: [0, 0, 20, 20] })!;
		expect(store.handleNoteKey(key('Backspace', 'Backspace'), a)).toBe(true);
		expect(store.annotations).toHaveLength(0);
		cleanup();
	});

	it('clicking the same spot cycles through overlapping annotations, innermost first', () => {
		const { store, cleanup } = setup();
		const outer = store.create('area', { page: 1, rect: [0, 0, 300, 300] })!;
		store.commit();
		const inner = store.create('area', { page: 1, rect: [50, 50, 150, 150] })!;
		store.commit();
		const stack = hitStack(store.annotations as Annotation[], 100, 100);
		expect(stack.map((a) => a.id)).toEqual([inner.id, outer.id]);
		store.pick(stack, { page: 1, x: 100, y: 100 });
		expect(store.selectedIds).toEqual([inner.id]);
		store.pick(stack, { page: 1, x: 100, y: 100 });
		expect(store.selectedIds).toEqual([outer.id]);
		store.pick(stack, { page: 1, x: 100, y: 100 });
		expect(store.selectedIds).toEqual([inner.id]);
		cleanup();
	});

	it('filters by colour and adds custom colours to the palette', () => {
		const { store, cleanup } = setup();
		store.create('area', { page: 1, rect: [0, 0, 10, 10] });
		store.commit();
		const key = store.addColor('#123456');
		expect(store.palette.at(-1)!.key).toBe(key);
		expect(store.addColor('#123456')).toBe(key); // reused
		store.color = key;
		store.create('area', { page: 1, rect: [20, 20, 30, 30] });
		store.commit();
		store.colorFilter = [key];
		expect(store.visible).toHaveLength(1);
		store.annotationsVisible = false;
		expect(store.visible).toHaveLength(0);
		cleanup();
	});
});

describe('note markdown', () => {
	it('renders markdown and maths, and strips scripts', async () => {
		const html = await renderMarkdown(
			'**bold** _it_ `code` $x^2$ <img src=x onerror=alert(1)> <script>alert(1)</script>'
		);
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>it</em>');
		expect(html).toContain('katex');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('<script');
	});
});
