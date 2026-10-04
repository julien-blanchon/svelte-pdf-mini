<script module lang="ts">
	export const meta = {
		title: 'Scroll modes & rotation',
		description: 'Vertical, horizontal, wrapped (grid) and single-page layouts; rotate the whole document.',
		order: 3,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, PageNav, Viewer, type Rotation, type ScrollMode } from 'svelte-pdf-mini';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let scrollMode = $state<ScrollMode>('vertical');
	let rotation = $state<Rotation>(0);
	let page = $state(1);
	let zoom = $state(0.5);
	const modes: ScrollMode[] = ['vertical', 'horizontal', 'wrapped', 'page'];
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root bind:scrollMode bind:rotation bind:page bind:zoom zoomMode={scrollMode === 'wrapped' ? 'manual' : 'page-fit'} class="flex h-full flex-col">
		<div class="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2 text-sm dark:border-neutral-800">
			{#each modes as m (m)}
				<button class="rounded px-2 py-1 capitalize hover:bg-neutral-100 data-[active]:bg-neutral-900 data-[active]:text-white dark:hover:bg-neutral-800" data-active={scrollMode === m || undefined} onclick={() => {
						scrollMode = m;
						if (m === 'wrapped') zoom = 0.35;
					}}>{m}</button>
			{/each}
			<span class="mx-2 h-5 w-px bg-neutral-300"></span>
			<button class="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800" onclick={() => (rotation = ((rotation + 270) % 360) as Rotation)} aria-label="Rotate counter-clockwise"><span class="icon-[lucide--rotate-ccw] size-4"></span></button>
			<button class="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800" onclick={() => (rotation = ((rotation + 90) % 360) as Rotation)} aria-label="Rotate clockwise"><span class="icon-[lucide--rotate-cw] size-4"></span></button>
			<span class="ml-auto flex items-center gap-1">
				<PageNav.Prev class="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"><span class="icon-[lucide--chevron-left] size-4"></span></PageNav.Prev>
				<PageNav.Input class="w-10 rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-center dark:border-neutral-700" />
				<PageNav.Next class="rounded px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"><span class="icon-[lucide--chevron-right] size-4"></span></PageNav.Next>
			</span>
		</div>
		<Viewer.Viewport class="min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
			<Viewer.Pages />
		</Viewer.Viewport>
	</Viewer.Root>
</Document.Root>
