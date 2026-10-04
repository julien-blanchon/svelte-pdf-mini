<script lang="ts">
	import { PageCanvasState, PageState, PageTextLayerState, type ViewerState } from 'svelte-pdf-mini';

	let { viewer, pageNumber }: { viewer: ViewerState; pageNumber: number } = $props();
	// svelte-ignore state_referenced_locally (a page belongs to one viewer for its lifetime)
	const page = new PageState(viewer, () => pageNumber);
	const canvas = new PageCanvasState(page);
	const text = new PageTextLayerState(page);
</script>

<div {...page.props}>
	<div {...canvas.props}></div>
	<div {...text.props}></div>
	{#if !canvas.rendered}
		<span class="absolute inset-0 grid place-items-center text-sm text-neutral-400">{pageNumber}</span>
	{/if}
</div>
