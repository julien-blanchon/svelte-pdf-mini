<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import type { ZoomModeProps } from './types.js';

	let { mode, ref = $bindable(null), child, children, ...rest }: ZoomModeProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const active = $derived(viewer.zoomMode === mode);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-zoom-mode': mode,
			'data-active': dataAttr(active),
			'aria-pressed': active,
			onclick: () => (viewer.zoomMode = mode),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, active })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ active })}{:else}{mode}{/if}</button
	>
{/if}
