import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { Annotation } from '../core/annotations/model.js';
import { hitStack } from '../core/annotations/geometry.js';
import { renderMarkdown } from '../internal/markdown.js';
import { defaultKeymap } from '../core/i18n/keymap.js';
import { importAnnotations } from '../core/pdf-codec/index.js';
import { foreignPdf } from '../core/pdf-codec/foreign.test.helper.js';
import { defaultNoteEmojis } from '../core/annotations/emoji.js';
import { AnnotationStore, type AnnotationStoreOptions } from './annotations.svelte.js';
import type { ViewerState } from './viewer.svelte.js';

/** Just enough of a viewer for the store (`pdf`: a loaded document with these bytes). */
function fakeViewer(pdf?: Uint8Array, scrollEl: HTMLElement | null = null) {
	return {
		scrollEl,
		selection: { selecting: false, isEmpty: true, ranges: [], clear() {} },
		document: {
			proxy: pdf ? {} : null,
			pageTextSync: () => undefined,
			getData: async () => pdf!.slice(),
			getPageText: async () => ({ textInQuads: () => '' })
		},
		hideNativeAnnotations: false,
		keymap: defaultKeymap,
		addContextResolver: () => () => {},
		t: (k: string) => k
	} as unknown as ViewerState;
}

function setup(
	pdf?: Uint8Array,
	opts: Omit<AnnotationStoreOptions, 'viewer'> = {},
	scrollEl: HTMLElement | null = null
) {
	let store!: AnnotationStore;
	const cleanup = $effect.root(() => {
		store = new AnnotationStore({ viewer: fakeViewer(pdf, scrollEl), ...opts });
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

	it('discarding one markup of a multi-page step keeps the others undoable', () => {
		const { store, cleanup } = setup();
		let first!: Annotation;
		store.batch(() => {
			first = store.create('area', { page: 1, rect: [0, 0, 10, 10] })!;
			store.create('area', { page: 2, rect: [0, 0, 10, 10] });
		});
		store.pendingId = first.id;
		store.discard();
		expect(store.annotations).toHaveLength(1);
		expect(store.canUndo).toBe(true);
		store.undo();
		expect(store.annotations).toHaveLength(0);
		cleanup();
	});

	it('digits recolor and Backspace discards only while the note is pristine', () => {
		const { store, cleanup } = setup();
		const a = store.create('area', { page: 1, rect: [10, 10, 100, 100] })!;
		expect(store.handleNoteKey(key('2', 'Digit2'), a)).toBe(true);
		expect(store.byId.get(a.id)!.paletteKey).toBe(store.palette[1].key);
		store.markTyped(a.id);
		expect(store.handleNoteKey(key('3', 'Digit3'), a)).toBe(false); // types normally now
		expect(store.handleNoteKey(key('Backspace', 'Backspace'), a)).toBe(false);
		expect(store.handleNoteKey(key('3', 'Digit3', { altKey: true }), a)).toBe(true); // Alt always recolors
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

	it('filters by color and adds custom colors to the palette', () => {
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

describe('note emoji', () => {
	/** A store offering the default emoji, with keys dispatched on a real viewport element. */
	function emojiSetup() {
		const scroller = document.createElement('div');
		const { store, cleanup } = setup(undefined, { noteEmojis: defaultNoteEmojis }, scroller);
		const press = (k: string) => {
			scroller.dispatchEvent(key(k, `Digit${k}`));
			flushSync();
		};
		return { store, cleanup, press };
	}

	it('keys 1–8 pick the emoji of new notes while the note tool is active', () => {
		const { store, cleanup, press } = emojiSetup();
		expect(store.noteEmoji).toBe('💬');
		expect(store.pickingNoteEmoji).toBe(false);
		store.tool = 'note';
		expect(store.pickingNoteEmoji).toBe(true);
		press('4');
		expect(store.noteEmoji).toBe('🤯');
		expect(store.color).toBe('yellow'); // not a color pick
		const a = store.create('note', { page: 1, rect: [0, 0, 20, 20] })!;
		expect(a.emoji).toBe('🤯');
		press('9'); // no ninth emoji: nothing, and no recolor either
		expect(store.byId.get(a.id)).toMatchObject({ emoji: '🤯', paletteKey: 'yellow' });
		cleanup();
	});

	it('digits give the pending or selected note an emoji; other kinds keep colors', () => {
		const { store, cleanup, press } = emojiSetup();
		const a = store.create('note', { page: 1, rect: [0, 0, 20, 20] })!;
		expect(store.handleNoteKey(key('2', 'Digit2'), a)).toBe(true);
		expect(store.byId.get(a.id)).toMatchObject({ emoji: '🤔', paletteKey: 'yellow' });
		store.commit();
		store.select(a.id);
		press('3');
		expect(store.byId.get(a.id)).toMatchObject({ emoji: '💡' });
		const box = store.create('area', { page: 1, rect: [0, 0, 50, 50] })!;
		expect(store.pickingNoteEmoji).toBe(false);
		press('2');
		expect(store.byId.get(box.id)!.paletteKey).toBe(store.palette[1].key);
		expect(store.noteEmoji).toBe('💡');
		cleanup();
	});

	it('without noteEmojis notes use the icon and digits recolor them', () => {
		const { store, cleanup } = setup();
		store.tool = 'note';
		expect(store.pickingNoteEmoji).toBe(false);
		const a = store.create('note', { page: 1, rect: [0, 0, 20, 20] })!;
		expect(a.emoji).toBeUndefined();
		expect(store.handleNoteKey(key('2', 'Digit2'), a)).toBe(true);
		expect(store.byId.get(a.id)!.paletteKey).toBe(store.palette[1].key);
		cleanup();
	});

	it('an active emoji no longer in the set falls back to the first', () => {
		const emojis = $state(['💬', '🔥']);
		const { store, cleanup } = setup(undefined, { noteEmojis: () => emojis });
		store.noteEmoji = '🔥';
		expect(store.noteEmoji).toBe('🔥');
		emojis[1] = '🧪';
		expect(store.noteEmoji).toBe('💬');
		cleanup();
	});
});

describe('AnnotationStore and the PDF', () => {
	it('a deleted foreign annotation is removed on export; undoing the deletion keeps it', async () => {
		const { store, cleanup } = setup(await foreignPdf());
		await store.importFromPdf();
		expect(store.saveSupport).toEqual({ encrypted: false, canSave: true });
		const [foreign] = store.annotations;
		expect(foreign.origin).toBe('foreign');
		expect(store.removedForeign).toEqual([]);

		store.remove([foreign.id]);
		expect(store.removedForeign).toEqual([foreign.id]);
		let reread = await importAnnotations(await store.exportPdf());
		expect(reread.annotations).toEqual([]);

		store.undo();
		expect(store.removedForeign).toEqual([]);
		reread = await importAnnotations(await store.exportPdf());
		expect(reread.annotations.map((a) => a.id)).toEqual([foreign.id]);
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

	it('leaves prices alone and opens links in a new tab', async () => {
		const html = await renderMarkdown('costs $5 and $10, see [docs](https://x.org)');
		expect(html).not.toContain('katex');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});
});
