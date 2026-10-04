<script module lang="ts">
	export const meta = {
		title: 'Paper library',
		description: 'Papers as cards with equal-size covers (the top of the first page, tinted with its category’s paper colour). Filtering re-flows the grid with animate:flip; quick look morphs the card into a bits-ui Dialog with a crossfade; open any paper in the full reader.',
		order: 102,
		kind: 'app'
	} as const;
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { crossfade, fade, scale } from 'svelte/transition';
	import { Document, PageNav, Viewer, pageThemes, paperColors } from 'svelte-pdf-mini';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { arxivPdf, papers } from '#lib/demos/papers.ts';
	import Cover from './Cover.svelte';

	const categories = [
		{ name: 'Machine learning', color: paperColors[0] },
		{ name: 'Computer vision', color: paperColors[3] },
		{ name: 'Probability', color: paperColors[1] },
		{ name: 'Language models', color: paperColors[4] },
		{ name: 'Physics', color: paperColors[2] }
	];
	const categoryOf: Record<string, number> = { '1706.03762': 0, '1512.03385': 1, '2601.05637': 0, '1312.6114': 2, '2005.14165': 3, 'hep-th/9711200': 4 };
	let filter = $state('all');
	let dark = $state(false);
	let open = $state<string | null>(null);
	/** Last opened paper: the dialog keeps showing it while it animates out (open is null by then). */
	let lastOpen = $state<string | null>(null);
	const shown = $derived(papers.filter((p) => filter === 'all' || String(categoryOf[p.id]) === filter));
	const openPaper = $derived(papers.find((p) => p.id === (open ?? lastOpen)));
	const themeFor = (i: number) => pageThemes.paper({ color: dark ? categories[i].color.accent : categories[i].color.light, dark, strength: dark ? 0.6 : 0.8 });

	// Card cover ⇄ dialog body morph.
	const [send, receive] = crossfade({ duration: 320, easing: cubicOut, fallback: (node) => scale(node, { start: 0.96, duration: 180 }) });
</script>

<div class={['h-full overflow-y-auto', dark && 'dark']}>
	<div class="min-h-full bg-[#f6f4f0] p-6 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
		<header class="mb-6 flex flex-wrap items-center gap-3">
			<h2 class="mr-2 font-serif text-2xl">Library</h2>
			<ToggleGroup label="Category" bind:value={filter} items={[{ value: 'all', label: 'All' }, ...categories.map((c, i) => ({ value: String(i), label: c.name }))]} />
			<ToggleGroup class="ml-auto" label="Day or night" bind:value={() => (dark ? 'night' : 'day'), (v) => (dark = v === 'night')} items={[{ value: 'day', label: 'Day', icon: icons.sun }, { value: 'night', label: 'Night', icon: icons.moon }]} />
		</header>
		<ul class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
			{#each shown as p (p.id)}
				{@const ci = categoryOf[p.id]}
				{@const cat = categories[ci]}
				<li animate:flip={{ duration: 280, easing: cubicOut }} in:fade={{ duration: 180 }} out:scale={{ start: 0.94, duration: 160 }} class="h-full">
					<button class="group flex h-full w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-stone-900 dark:ring-white/10" onclick={() => (open = lastOpen = p.id)}>
						<!-- Fixed aspect: every cover has the same size; the page is cropped to its top. -->
						<div class="relative aspect-[4/3] overflow-hidden">
							{#if open !== p.id}
								<div class="absolute inset-0" in:receive={{ key: p.id }} out:send={{ key: p.id }}>
									<Cover src={arxivPdf(p.id)} theme={themeFor(ci)} />
								</div>
							{/if}
							<div class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent dark:from-stone-900"></div>
						</div>
						<div class="flex flex-1 flex-col gap-1 p-3">
							<span class="flex items-center gap-1.5 text-[11px] text-stone-500"><span class="size-2 rounded-full" style:background={cat.color.accent}></span>{cat.name}</span>
							<p class="line-clamp-2 font-serif leading-snug">{p.title}</p>
							<p class="mt-auto truncate text-xs text-stone-500">arXiv:{p.id} · {p.note}</p>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<Dialog.Root open={!!open} onOpenChange={(o) => !o && (open = null)}>
		<Dialog.Portal>
			<Dialog.Overlay forceMount>
				{#snippet child({ props, open: isOpen })}
					{#if isOpen}<div {...props} transition:fade={{ duration: 180 }} class="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px]"></div>{/if}
				{/snippet}
			</Dialog.Overlay>
			<Dialog.Content forceMount>
				{#snippet child({ props, open: isOpen })}
					{#if isOpen && openPaper}
						{@const ci = categoryOf[openPaper.id]}
						<div {...props} class={['fixed inset-0 z-50 m-auto flex h-[90vh] w-[min(1000px,94vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none dark:bg-stone-900', dark && 'dark']} in:receive={{ key: openPaper.id }} out:send={{ key: openPaper.id }}>
							<Document.Root src={arxivPdf(openPaper.id)}>
								<Viewer.Root zoomMode="page-width" pageTheme={themeFor(ci)} pageFrame="rounded" theme={dark ? 'dark' : 'light'} class="flex h-full flex-col text-stone-800 dark:text-stone-200">
									<header class="flex items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
										<Dialog.Title class="min-w-0 flex-1 truncate font-serif">{openPaper.title}</Dialog.Title>
										<PageNav.Prev class="grid size-8 place-items-center rounded-md hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"><span class="{icons.prev} size-4"></span></PageNav.Prev>
										<PageNav.Input class="w-10 rounded border border-stone-300 bg-transparent text-center text-sm dark:border-stone-700" />
										<PageNav.Next class="grid size-8 place-items-center rounded-md hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"><span class="{icons.next} size-4"></span></PageNav.Next>
										<a href="{resolve('/demo/[slug]', { slug: 'reader' })}?paper={encodeURIComponent(openPaper.id)}" class="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white dark:bg-stone-100 dark:text-stone-900"><span class="{icons.book} size-4"></span>Open in reader</a>
										<Dialog.Close class="grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close"><span class="{icons.close} size-4"></span></Dialog.Close>
									</header>
									<Viewer.Viewport class="min-h-0 flex-1 bg-[#f6f4f0] dark:bg-stone-950">
										<Viewer.Pages />
									</Viewer.Viewport>
								</Viewer.Root>
							</Document.Root>
						</div>
					{/if}
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</div>
