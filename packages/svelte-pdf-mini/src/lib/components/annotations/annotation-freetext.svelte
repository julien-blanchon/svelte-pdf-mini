<!-- A text box on the page; its text is typed right here while editing. Internal to Annotations.Layer. -->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { FreeTextAnnotation } from '../../core/annotations/model.js';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { PercentBox } from './geometry.js';

	let {
		annotation: a,
		box,
		color,
		selected
	}: {
		annotation: FreeTextAnnotation;
		box: PercentBox;
		color: string;
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
	data-pdf-annotation-freetext=""
	data-pdf-annotation-ui={dataAttr(editing)}
	data-selected={dataAttr(selected)}
	data-editing={dataAttr(editing)}
	data-font={a.font.family}
	data-bold={dataAttr(a.font.bold)}
	data-italic={dataAttr(a.font.italic)}
	style:--pdf-left="{box.left}%"
	style:--pdf-top="{box.top}%"
	style:--pdf-width="{box.width}%"
	style:--pdf-height="{box.height}%"
	style:--pdf-font-size="{a.font.size}px"
	style:--annotation-color={color}
>
	{#if editing}
		<textarea
			{@attach focusAtEnd}
			aria-label={store.viewer.t('textBox')}
			value={a.text}
			placeholder={store.viewer.t('typeText')}
			oninput={(e) => {
				store.markTyped(a.id);
				store.update(a.id, { text: e.currentTarget.value });
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
	[data-pdf-annotation-freetext] {
		position: absolute;
		left: var(--pdf-left);
		top: var(--pdf-top);
		width: var(--pdf-width);
		height: var(--pdf-height);
		font-size: calc(var(--pdf-scale) * var(--pdf-font-size));
		font-family: Helvetica, Arial, sans-serif;
		font-weight: 400;
		font-style: normal;
		line-height: 1.25;
		color: var(--annotation-color);
		pointer-events: none;
		z-index: 0;
	}
	[data-font='Times'] {
		font-family:
			Times New Roman,
			serif;
	}
	[data-font='Courier'] {
		font-family:
			Courier New,
			monospace;
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
</style>
