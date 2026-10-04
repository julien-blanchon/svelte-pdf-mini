<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import type { ZoomButtonProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: ZoomButtonProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const disabled = $derived(!viewer.canZoomIn);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-zoom-in': '',
			'aria-label': viewer.t('zoomIn'),
			disabled,
			onclick: () => viewer.zoomIn(),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, disabled })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ disabled })}{:else}+{/if}</button
	>
{/if}
