<script module lang="ts">
	export const meta = {
		title: 'Page layouts (spreads)',
		description: 'One to four pages per row with vertical scrolling, or "auto": zoom out with Ctrl/⌘ + wheel or the − button and the layout flows 1 → 2 → 3 → 4 pages per row.',
		order: 3.5,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, PageNav, Viewer, Zoom, type Columns, type ScrollMode } from 'svelte-pdf-mini';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let columns = $state<Columns>('auto');
	let scrollMode = $state<ScrollMode>('vertical');
	let firstPageAlone = $state(false);
	let zoom = $state(0.9);
	const choices: Columns[] = [1, 2, 3, 4, 'auto'];
	const btn = 'rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 data-[active]:bg-neutral-900 data-[active]:text-white dark:hover:bg-neutral-800 dark:data-[active]:bg-white dark:data-[active]:text-black';
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root bind:columns bind:scrollMode bind:zoom zoomMode="manual" {firstPageAlone} class="flex h-full flex-col">
		{#snippet children({ viewer })}
			<div class="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2 text-sm dark:border-neutral-800">
				<span class="mr-1 text-neutral-500">Pages per row</span>
				{#each choices as c (c)}
					<button class={btn} data-active={columns === c || undefined} onclick={() => (columns = c)}>{c === 'auto' ? 'Auto' : c}</button>
				{/each}
				<span class="mx-2 h-5 w-px bg-neutral-300"></span>
				<button class={btn} data-active={scrollMode === 'page' || undefined} onclick={() => (scrollMode = scrollMode === 'page' ? 'vertical' : 'page')}>Paged</button>
				<label class="ml-1 flex items-center gap-1.5"><input type="checkbox" bind:checked={firstPageAlone} /> Cover alone</label>
				<span class="mx-2 h-5 w-px bg-neutral-300"></span>
				<Zoom.Out class={btn}><span class="icon-[lucide--zoom-out] size-4"></span></Zoom.Out>
				<span class="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
				<Zoom.In class={btn}><span class="icon-[lucide--zoom-in] size-4"></span></Zoom.In>
				<span class="ml-auto flex items-center gap-1 text-neutral-500">
					<PageNav.Prev class={btn}><span class="icon-[lucide--chevron-left] size-4"></span></PageNav.Prev>
					<PageNav.Input class="w-9 rounded border border-neutral-300 bg-transparent py-0.5 text-center dark:border-neutral-700" />
					<PageNav.Next class={btn}><span class="icon-[lucide--chevron-right] size-4"></span></PageNav.Next>
					<span class="ml-2 tabular-nums">{viewer.effectiveColumns} per row</span>
				</span>
			</div>
			<Viewer.Viewport class="min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
				<Viewer.Pages />
			</Viewer.Viewport>
		{/snippet}
	</Viewer.Root>
</Document.Root>
