<!-- A text box on the page; its text is typed right here while editing. Internal to Annotations.Layer. -->
<script lang="ts" module>
	/** Line height of a box's text, in font sizes (as in the CSS below). */
	const LINE_HEIGHT = 1.25;

	let canvas: CanvasRenderingContext2D | null | undefined;
	/** A canvas to measure text with (none outside the browser). */
	function measureContext() {
		if (canvas === undefined)
			canvas =
				typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
		return canvas;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { freetextFontCss } from '../../core/annotations/fonts.js';
	import type { FreeTextAnnotation } from '../../core/annotations/model.js';
	import type { PdfRect } from '../../core/types.js';
	import { dataAttr, verbatimInput } from '../../internal/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { PercentBox } from './geometry.js';

	let {
		annotation: a,
		box,
		ink,
		selected
	}: {
		annotation: FreeTextAnnotation;
		box: PercentBox;
		/** Text color: the ink shade of the annotation's color. */
		ink: string;
		selected: boolean;
	} = $props();
	const store = AnnotationsContext.get();
	const editing = $derived(store.editingId === a.id && store.canEdit(a));
	const pending = $derived(store.pendingId === a.id);

	/** Focus with the caret at the end. */
	const focusAtEnd: Attachment<HTMLTextAreaElement> = (node) => {
		node.focus({ preventScroll: true });
		node.setSelectionRange(node.value.length, node.value.length);
	};

	// ── Autosize: the box is as big as its text (`autosize`) ─────────────────────
	let root: HTMLElement | null = $state(null);
	/** Inner margin, in PDF points: the PDF writer insets the text by as much. */
	const PAD = 4;

	/** The rect that fits `text` (kept at the box's top left), or null when not autosized. */
	function fitted(text: string): PdfRect | null {
		const ctx = root && a.autosize ? measureContext() : null;
		if (!ctx || !root) return null;
		// Measured in the box's own font, at its on-screen size (CSS px = points × scale).
		const style = getComputedStyle(root);
		ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		// A trailing newline is a line of its own (the caret goes there).
		const lines = (text || store.viewer.t('typeText')).split('\n');
		const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
		const scale = store.viewer.scale;
		// Some slack: the PDF's font metrics may run a bit wider than the browser's.
		const w = (width / scale) * 1.04 + 2 * PAD + 2;
		const h = lines.length * a.font.size * LINE_HEIGHT + 2 * PAD;
		const [x1, , , y2] = a.rect;
		return [x1, y2 - h, x1 + w, y2];
	}
	const differs = (r: PdfRect) => r.some((v, i) => Math.abs(v - a.rect[i]) > 0.5);

	function refit() {
		const rect = fitted(a.text);
		if (rect && differs(rect)) store.update(a.id, { rect });
	}
	// A new font (family, size, style) changes the text's size too.
	let lastFont = '';
	$effect(() => {
		const font = JSON.stringify(a.font);
		if (lastFont && font !== lastFont) {
			untrack(refit);
			// Again once a font not used before has loaded.
			void document.fonts?.ready.then(refit);
		}
		lastFont = font;
	});

	// Enter = new line; ⌘/Ctrl+Enter keeps; Esc keeps typed text (or discards an empty new box).
	function onKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (pending) store.commit();
			else store.editingId = null;
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (pending && !a.text) store.discard();
			else {
				if (pending) store.commit();
				store.editingId = null;
			}
		} else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
			store.handleNoteKey(e, a);
		}
	}
</script>

<div
	bind:this={root}
	data-pdf-annotation-freetext=""
	data-pdf-annotation-ui={dataAttr(editing)}
	data-selected={dataAttr(selected)}
	data-editing={dataAttr(editing)}
	data-font={a.font.family}
	data-bold={dataAttr(a.font.bold)}
	data-italic={dataAttr(a.font.italic)}
	data-autosize={dataAttr(a.autosize)}
	style:--pdf-left="{box.left}%"
	style:--pdf-top="{box.top}%"
	style:--pdf-width="{box.width}%"
	style:--pdf-height="{box.height}%"
	style:--pdf-font-size="{a.font.size}px"
	style:font-family={freetextFontCss(a.font.family)}
	style:--annotation-ink={ink}
>
	{#if editing}
		<textarea
			{@attach focusAtEnd}
			aria-label={store.viewer.t('textBox')}
			{...verbatimInput}
			value={a.text}
			placeholder={store.viewer.t('typeText')}
			oninput={(e) => {
				store.markTyped(a.id);
				const text = e.currentTarget.value;
				const rect = fitted(text);
				store.update(a.id, rect && differs(rect) ? { text, rect } : { text });
			}}
			onblur={() => {
				if (store.editingId === a.id) store.editingId = null;
			}}
			onkeydown={onKeydown}></textarea>
	{:else}
		<div data-part="text">{a.text}</div>
	{/if}
</div>

<style>
	@layer svelte-pdf-mini {
		[data-pdf-annotation-freetext] {
			position: absolute;
			left: var(--pdf-left);
			top: var(--pdf-top);
			width: var(--pdf-width);
			height: var(--pdf-height);
			font-size: calc(var(--pdf-scale) * var(--pdf-font-size));
			font-weight: 400;
			font-style: normal;
			line-height: 1.25; /* LINE_HEIGHT */
			color: var(--annotation-ink);
			pointer-events: none;
			z-index: 0;
		}
		[data-bold] {
			font-weight: 700;
		}
		[data-italic] {
			font-style: italic;
		}
		/* Above the other boxes and clickable while typing. */
		[data-editing] {
			pointer-events: auto;
			z-index: 2;
		}
		textarea {
			all: unset;
			box-sizing: border-box;
			width: 100%;
			height: 100%;
			white-space: pre-wrap;
			color: inherit;
			cursor: text;
		}
		[data-part='text'] {
			white-space: pre-wrap;
			overflow: hidden;
			width: 100%;
			height: 100%;
		}
		/* Sized by its text: inset like the PDF draws it, one line per Enter. */
		[data-autosize] :is(textarea, [data-part='text']) {
			box-sizing: border-box;
			padding: calc(var(--pdf-scale) * 4px);
			white-space: pre;
			overflow: hidden;
		}
	}
</style>
