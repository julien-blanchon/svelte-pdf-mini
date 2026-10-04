<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import Canvas from './viewer-canvas.svelte';
	import Page from './viewer-page.svelte';
	import TextLayer from './viewer-text-layer.svelte';
	import type { ViewerPagesProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: ViewerPagesProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, viewer.contentProps, refAttachment));
</script>

{#snippet pages()}
	{#each viewer.mountedPages as pageNumber (pageNumber)}
		{#if children}
			{@render children({ pageNumber })}
		{:else}
			<Page {pageNumber}>
				<Canvas />
				<TextLayer />
			</Page>
		{/if}
	{/each}
{/snippet}

{#if child}
	{@render child({ props: mergedProps, pageNumber: 0 })}
{:else}
	<div {...mergedProps}>{@render pages()}</div>
{/if}
