<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import type { ViewerViewportProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: ViewerViewportProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, viewer.viewportProps, refAttachment));
</script>

{#if child}
	{@render child({ props: mergedProps, viewer })}
{:else}
	<div {...mergedProps}>{@render children?.({ viewer })}</div>
{/if}
