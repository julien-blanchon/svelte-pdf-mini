<script module lang="ts">
	export const meta = {
		title: 'Outline & thumbnails',
		description: 'Three navigators side by side: the PDF outline (Outline.Tree), our table of contents from the paper analysis (Toc.Tree), and melt-ui’s createTableOfContents driven by the hidden headings Paper.Headings adds to every page. Plus lazy thumbnails and a breadcrumb.',
		order: 7,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Outline, Paper, Thumbnails, Toc, Viewer, type PaperState } from 'svelte-pdf-mini';
	import Tabs from '#lib/demos/components/ui/Tabs.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';
	import MeltToc from './MeltToc.svelte';

	type Tab = 'outline' | 'toc' | 'melt' | 'pages';
	let tab = $state<Tab>('melt');
	let paper = $state<PaperState>();
	const tabs: { value: Tab; label: string; icon: string }[] = [
		{ value: 'outline', label: 'Outline', icon: 'icon-[lucide--bookmark]' },
		{ value: 'toc', label: 'Toc.Tree', icon: 'icon-[lucide--list-tree]' },
		{ value: 'melt', label: 'melt-ui', icon: 'icon-[lucide--list]' },
		{ value: 'pages', label: 'Pages', icon: 'icon-[lucide--layers]' }
	];
	const onMeltSelect = (headingId: string) => {
		const s = paper?.flatSections.find((x) => `section-${x.id}` === headingId);
		if (s) paper?.goToSection(s);
	};
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="flex h-full">
		{#snippet children({ viewer })}
			<Paper.Root bind:paper>
				<aside class="flex w-80 shrink-0 flex-col border-r border-stone-200 text-sm dark:border-stone-800">
					<Tabs bind:value={tab} {tabs} class="min-h-0 flex-1" listClass="m-2">
						{#snippet content(id)}
							<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
								{#if id === 'outline'}
									<Outline.Root>
										<Outline.Tree class="[--pdf-outline-indent:14px] [&_[data-pdf-outline-item]]:truncate [&_[data-pdf-outline-item]]:rounded [&_[data-pdf-outline-item]]:px-1.5 [&_[data-pdf-outline-item]]:py-1 [&_[data-pdf-outline-item]:hover]:bg-stone-100 dark:[&_[data-pdf-outline-item]:hover]:bg-stone-800 [&_[data-pdf-outline-item][data-active]]:bg-blue-50 [&_[data-pdf-outline-item][data-active]]:font-medium [&_[data-pdf-outline-item][data-active]]:text-blue-700 [&_[data-pdf-outline-item][data-contains-active]]:text-blue-700 [&_[data-pdf-outline-toggle]]:w-5 [&_[data-pdf-outline-toggle]]:text-stone-400">
											{#snippet empty()}<p class="p-2 text-stone-500">This PDF has no outline.</p>{/snippet}
										</Outline.Tree>
									</Outline.Root>
								{:else if id === 'toc'}
									<Toc.Tree class="[--pdf-toc-indent:14px] [&_[data-pdf-toc-item]]:pl-2" />
								{:else if id === 'melt'}
									<p class="mb-2 rounded-md bg-stone-100 p-2 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
										<code>createTableOfContents(&#123; selector: '#outline-demo-pages', scrollFn &#125;)</code> from <code>@melt-ui/svelte</code>; the headings come from <code>&lt;Paper.Headings /&gt;</code>.
									</p>
									<MeltToc selector="#outline-demo-pages" onSelect={onMeltSelect} />
								{:else}
									<Thumbnails.Root width={150} class="space-y-3 pt-1">
										{#each { length: viewer.document.numPages } as _, i (i)}
											<Thumbnails.Item pageNumber={i + 1} class="mx-auto flex flex-col items-center gap-1 rounded p-1 text-xs text-stone-500 data-[current]:bg-blue-100 data-[current]:text-blue-700 dark:data-[current]:bg-blue-950 [&_[data-pdf-thumbnail-canvas]]:shadow" />
										{/each}
									</Thumbnails.Root>
								{/if}
							</div>
						{/snippet}
					</Tabs>
					<Toc.Breadcrumb class="border-t border-stone-200 px-3 py-2 text-xs text-stone-500 dark:border-stone-800" />
				</aside>
				<Viewer.Viewport class="min-w-0 flex-1 bg-stone-100 dark:bg-stone-900">
					<Viewer.Pages id="outline-demo-pages">
						{#snippet children({ pageNumber })}
							<Viewer.Page {pageNumber}>
								<Viewer.Canvas />
								<Viewer.TextLayer />
								<Paper.Headings />
							</Viewer.Page>
						{/snippet}
					</Viewer.Pages>
				</Viewer.Viewport>
			</Paper.Root>
		{/snippet}
	</Viewer.Root>
</Document.Root>
