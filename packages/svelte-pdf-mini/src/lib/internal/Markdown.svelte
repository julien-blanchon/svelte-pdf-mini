<script lang="ts">
	import { hasMarkup, renderMarkdown } from './markdown.js';

	let { source }: { source: string } = $props();
	/** Rendered HTML; null while loading or for plain text. */
	let html = $state<string | null>(null);
	$effect(() => {
		const src = source;
		html = null;
		if (!hasMarkup(src)) return;
		let alive = true;
		renderMarkdown(src).then(
			(h) => alive && (html = h),
			() => {}
		);
		return () => {
			alive = false;
		};
	});
</script>

{#if html !== null}
	<!-- Sanitised with DOMPurify in renderMarkdown. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div data-pdf-markdown="">{@html html}</div>
{:else}
	<p data-pdf-markdown="" data-plain="">{source}</p>
{/if}

<style>
	/* Scoped (always our element): must beat app-wide paragraph margins. */
	p[data-plain] {
		white-space: pre-wrap;
		margin: 0;
	}
</style>
