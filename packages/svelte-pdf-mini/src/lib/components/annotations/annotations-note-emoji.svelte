<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { AnnotationsNoteEmojiProps } from './types.js';

	let {
		emoji,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: AnnotationsNoteEmojiProps = $props();
	const store = AnnotationsContext.get();
	const active = $derived(store.noteEmoji === emoji);
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-annotation-note-emoji': emoji,
			'data-active': dataAttr(active),
			'aria-pressed': active,
			'aria-label': emoji,
			// Like a color swatch: also applies to the selected (or just created) notes.
			onclick: () => store.pickNoteEmoji(emoji),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, active })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ active })}{:else}{emoji}{/if}</button
	>
{/if}
