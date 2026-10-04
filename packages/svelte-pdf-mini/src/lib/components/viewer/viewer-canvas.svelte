<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PageContext } from '../../state/context.js';
	import { PageCanvasState } from '../../state/page.svelte.js';
	import type { ViewerCanvasProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: ViewerCanvasProps = $props();
	const canvas = new PageCanvasState(PageContext.get());
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, canvas.props, refAttachment));
</script>

{#if child}
	{@render child({ props: mergedProps, rendered: canvas.rendered })}
{:else}
	<!-- The canvas element is managed imperatively inside this container. -->
	<div {...mergedProps}></div>
	{@render children?.({ rendered: canvas.rendered })}
{/if}
