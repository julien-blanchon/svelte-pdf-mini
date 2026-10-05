<script lang="ts">
	import { cachedMarkdown, hasMarkup, renderMarkdown } from './markdown.js';

	let { source }: { source: string } = $props();
	/** Rendered HTML (from the cache right away when there); null while loading or for plain text. */
	let html = $derived<string | null>(cachedMarkdown(source) ?? null);
	$effect(() => {
		const src = source;
		if (!hasMarkup(src) || html !== null) return;
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
	/* Scoped (always our element): must beat app-wide paragraph margins (so outside the library layer). */
	p[data-plain] {
		white-space: pre-wrap;
		margin: 0;
	}
</style>
