<script module lang="ts">
	export const meta = {
		title: 'Table of contents views',
		description: 'Sections extracted from the paper (outline when present, headings otherwise), shown five ways: tree, flat list, breadcrumb, progress bar and a margin rail. All follow the section you are reading.',
		order: 14,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Paper, Toc, Viewer } from 'svelte-pdf-mini';
	import { arxivPdf, papers } from '#lib/demos/papers.ts';

	let paperId = $state('1512.03385');
	let view = $state<'tree' | 'flat'>('tree');
</script>

<Document.Root src={arxivPdf(paperId)}>
	<Viewer.Root zoomMode="page-width" class="flex h-full flex-col">
		<Paper.Root>
			{#snippet children({ paper })}
				<header class="space-y-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
					<div class="flex items-center gap-3 text-sm">
						<select bind:value={paperId} class="rounded border border-neutral-300 bg-transparent px-1 py-0.5 dark:border-neutral-700">
							{#each papers as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
						</select>
						<Toc.Breadcrumb class="min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-300" />
						<span class="text-xs text-neutral-500">{paper.status === 'analyzing' ? `analysing… ${Math.round(paper.progress * 100)}%` : `${paper.flatSections.length} sections · ${Math.round(paper.readingProgress * 100)}% read`}</span>
					</div>
					<Toc.Progress class="[--pdf-progress-height:8px]" />
				</header>
				<div class="flex min-h-0 flex-1">
					<aside class="flex w-72 shrink-0 flex-col border-r border-neutral-200 text-sm dark:border-neutral-800">
						<div class="flex gap-1 p-2">
							{#each ['tree', 'flat'] as const as v (v)}
								<button class="rounded px-2 py-1 capitalize data-[active]:bg-neutral-900 data-[active]:text-white dark:data-[active]:bg-white dark:data-[active]:text-black" data-active={view === v || undefined} onclick={() => (view = v)}>{v}</button>
							{/each}
						</div>
						{#if view === 'tree'}
							<Toc.Tree class="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [--pdf-toc-indent:14px] [&_[data-pdf-toc-item]]:pl-2">
								{#snippet empty({ status })}<p class="p-2 text-neutral-500">{status === 'analyzing' ? 'Analysing…' : 'No sections found.'}</p>{/snippet}
							</Toc.Tree>
						{:else}
							<Toc.Flat maxDepth={2} class="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [&_[data-part=page]]:float-right [&_[data-part=page]]:text-xs [&_[data-part=page]]:text-neutral-400 [&_[data-pdf-toc-item]]:px-2 [&_[data-pdf-toc-item][data-depth='2']]:pl-6" />
						{/if}
					</aside>
					<div class="relative min-w-0 flex-1">
						<Viewer.Viewport class="h-full bg-neutral-100 dark:bg-neutral-900">
							<Viewer.Pages />
						</Viewer.Viewport>
						<!-- Rail: one dot per section, at its position in the document. -->
						<Toc.Rail class="absolute top-6 right-5 bottom-6" />
					</div>
				</div>
			{/snippet}
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
