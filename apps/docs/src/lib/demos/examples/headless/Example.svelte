<script module lang="ts">
	export const meta = {
		title: 'Headless (no components)',
		description: 'The state classes on their own: PdfDocument + ViewerState + per-page states, spread onto your own markup.',
		order: 20,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { PdfDocument, ViewerState } from 'svelte-pdf-mini';
	import HeadlessPage from './HeadlessPage.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	const doc = new PdfDocument({ src: () => defaultPaper });
	const viewer = new ViewerState({ document: doc, zoomMode: 'page-width' });
</script>

<div class="flex h-full flex-col">
	<p class="border-b border-neutral-200 p-2 text-sm dark:border-neutral-800">
		{doc.status} · page {viewer.page}/{doc.numPages} · {Math.round(viewer.zoom * 100)}%
		<button class="ml-2 rounded border px-2" onclick={() => viewer.zoomOut()} aria-label="Zoom out"><span class="icon-[lucide--minus] size-3.5"></span></button>
		<button class="rounded border px-2" onclick={() => viewer.zoomIn()} aria-label="Zoom in"><span class="icon-[lucide--plus] size-3.5"></span></button>
	</p>
	<div {...viewer.viewportProps} class="min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
		<div {...viewer.contentProps}>
			{#each viewer.mountedPages as n (n)}
				<HeadlessPage {viewer} pageNumber={n} />
			{/each}
		</div>
	</div>
</div>
