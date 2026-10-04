<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { dataAttr } from '../../internal/types.js';
	import type { AnnotationTool } from '../../state/annotations.svelte.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { AnnotationsToolProps } from './types.js';

	let { tool, ref = $bindable(null), child, children, ...rest }: AnnotationsToolProps = $props();
	const store = AnnotationsContext.get();
	/** Tools that only look around, so they stay usable when read-only. */
	const VIEW_TOOLS: readonly AnnotationTool[] = ['select', 'hand'];
	const label = $derived(store.viewer.t(`tool_${tool}`));
	const active = $derived(store.tool === tool);
	const disabled = $derived(store.readonly && !VIEW_TOOLS.includes(tool));
	/** Clicking the active tool again goes back to select. */
	const toggle = () => (store.tool = active && tool !== 'select' ? 'select' : tool);
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-annotation-tool': tool,
			'data-active': dataAttr(active),
			'aria-pressed': active,
			'aria-label': label,
			title: label,
			disabled,
			onclick: toggle,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, active })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ active })}{:else}{label}{/if}</button
	>
{/if}
