<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PageContext } from '../../state/context.js';
	import { PageTextLayerState } from '../../state/page.svelte.js';
	import type { ViewerTextLayerProps } from './types.js';

	let {
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: ViewerTextLayerProps = $props();
	const layer = new PageTextLayerState(PageContext.get());
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, layer.props, refAttachment));
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<!-- Text spans are managed by pdf.js inside this container. -->
	<div {...mergedProps}></div>
{/if}
