<script module lang="ts">
	export const meta = {
		title: 'Text selection',
		description: 'The browser selection mapped to the text index: per-page ranges, PDF-space quads and clean text (lines joined, hyphens removed). Copy gets the clean text too.',
		order: 9,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Viewer } from 'svelte-pdf-mini';
	import { defaultPaper } from '#lib/demos/papers.ts';
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="flex h-full">
		{#snippet children({ viewer })}
			<Viewer.Viewport class="min-w-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
				<Viewer.Pages />
			</Viewer.Viewport>
			<aside class="w-80 shrink-0 space-y-3 overflow-y-auto border-l border-neutral-200 p-3 text-sm dark:border-neutral-800">
				<h2 class="font-medium">Selection</h2>
				{#if viewer.selection.isEmpty}
					<p class="text-neutral-500">Select some text in the paper.</p>
				{:else}
					<blockquote class="border-l-2 border-blue-500 pl-3 font-serif">{viewer.selection.text}</blockquote>
					{#each viewer.selection.ranges as r (r.page)}
						<div class="rounded bg-neutral-100 p-2 font-mono text-xs dark:bg-neutral-900">
							page {r.page} · chars {r.start}–{r.end} · {r.quads.length} quad{r.quads.length === 1 ? '' : 's'}<br />
							rect [{r.rect?.map((v) => v.toFixed(1)).join(', ')}]
						</div>
					{/each}
				{/if}
			</aside>
		{/snippet}
	</Viewer.Root>
</Document.Root>
