<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Attachment } from 'svelte/attachments';
	import Markdown from '../../internal/Markdown.svelte';
	import { isActivationKey } from '../../internal/roving.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { AnnotationsCommentProps } from './types.js';

	let {
		annotation,
		placeholder,
		autofocus = false,
		mode = 'auto',
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: AnnotationsCommentProps = $props();
	const store = AnnotationsContext.get();
	const editable = $derived(store.canEdit(annotation));
	let focused = $state(false);

	/**
	 * Show the textarea? 'edit': always; 'view': never; 'auto': while this note is
	 * being edited, focused, or still empty. Never for a read-only annotation.
	 */
	const editing = $derived.by(() => {
		if (!editable || mode === 'view') return false;
		if (mode === 'edit') return true;
		const open = store.editingId === annotation.id;
		const empty = !annotation.contents;
		return open || focused || empty;
	});

	/** Grow the textarea with its content. */
	function fit(textarea: HTMLTextAreaElement) {
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	// Refit when the note changes from outside too (undo, another view of the same note).
	const autosize: Attachment<HTMLTextAreaElement> = (node) => {
		void annotation.contents;
		fit(node);
	};
	const focusOnMount: Attachment<HTMLTextAreaElement> = (node) => {
		if (autofocus) node.focus({ preventScroll: true });
	};

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-comment': '',
			'data-mode': editing ? 'edit' : 'view',
			'data-pdf-annotation-ui': '',
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<div {...mergedProps}>
		{#if editing}
			<textarea
				{@attach autosize}
				{@attach focusOnMount}
				rows="1"
				data-part="input"
				placeholder={placeholder ?? store.viewer.t('addNote')}
				aria-label={store.viewer.t('addNote')}
				value={annotation.contents ?? ''}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
				oninput={(e) => {
					store.markTyped(annotation.id);
					store.update(annotation.id, { contents: e.currentTarget.value });
					fit(e.currentTarget);
				}}
				onkeydown={(e) => {
					e.stopPropagation();
					store.handleNoteKey(e, annotation);
				}}></textarea>
		{:else if annotation.contents}
			{#if editable}
				<!-- Click the rendered note to edit it. -->
				<div
					role="button"
					tabindex="0"
					data-part="view"
					aria-label="Edit note"
					onclick={() => store.edit(annotation.id)}
					onkeydown={(e) => {
						if (!isActivationKey(e)) return;
						e.preventDefault();
						store.edit(annotation.id);
					}}
				>
					<Markdown source={annotation.contents} />
				</div>
			{:else}
				<Markdown source={annotation.contents} />
			{/if}
		{/if}
	</div>
{/if}

<style>
	/* A borderless textarea that reads like the note text it edits (scoped: only our own markup renders it). */
	textarea {
		width: 100%;
		resize: none;
		overflow: hidden;
		font: inherit;
		color: inherit;
		background: transparent;
		border: 0;
		outline: none;
		padding: 0;
	}
</style>
