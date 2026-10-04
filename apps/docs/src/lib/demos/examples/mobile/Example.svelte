<script module lang="ts">
	export const meta = {
		title: 'Mobile reader',
		description: 'Touch-first layout: full-bleed pages, a bottom toolbar with large targets, bottom sheets for contents and notes, highlight from a long-press selection. Best viewed at phone width.',
		order: 105,
		kind: 'app'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, PageNav, Paper, Toc, Viewer, pageThemes, type Annotation } from 'svelte-pdf-mini';
	import { arxivPdf } from '#lib/demos/papers.ts';

	let sheet = $state<'contents' | 'notes' | null>(null);
	let night = $state(false);
	let annotations = $state<Annotation[]>([]);
	const big = 'grid h-12 min-w-12 place-items-center rounded-xl text-lg active:bg-stone-200 disabled:opacity-30 dark:active:bg-stone-700';
</script>

<div class={['mx-auto flex h-full max-w-[480px] flex-col', night && 'dark']}>
	<Document.Root src={arxivPdf('1706.03762')}>
		<Viewer.Root zoomMode="page-width" pageTheme={pageThemes.paper({ dark: night, strength: 0.45 })} theme={night ? 'dark' : 'light'} class="relative flex min-h-0 flex-1 flex-col bg-stone-100 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
			<Paper.Root>
				<Annotations.Root bind:annotations author={{ name: 'You' }}>
					<header class="flex items-center gap-2 px-3 pt-2 pb-1">
						<Toc.Breadcrumb class="min-w-0 flex-1 truncate text-sm [&_[data-pdf-toc-item]:not(:last-of-type)]:hidden [&_[data-part=separator]]:hidden" />
					</header>
					<Toc.Progress class="mx-3 [--pdf-progress-height:3px]" />
					<Viewer.Viewport class="min-h-0 flex-1 [--pdf-page-gap:8px] [--pdf-pages-padding:8px_0]">
						<Viewer.Pages>
							{#snippet children({ pageNumber })}
								<Viewer.Page {pageNumber}>
									<Viewer.Canvas />
									<Viewer.TextLayer />
									<Paper.Layer />
									<Annotations.Layer />
									<Viewer.Focus />
								</Viewer.Page>
							{/snippet}
						</Viewer.Pages>
					</Viewer.Viewport>

					<!-- Bottom toolbar: large tap targets. -->
					<nav class="flex items-center justify-around border-t border-stone-200 bg-white/90 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/90" aria-label="Reader">
						<button class={big} aria-label="Contents" onclick={() => (sheet = 'contents')}><span class="icon-[lucide--list-tree] size-5"></span></button>
						<PageNav.Prev class={big}><span class="icon-[lucide--chevron-left] size-4"></span></PageNav.Prev>
						<PageNav.Input class="h-10 w-12 rounded-lg border border-stone-300 bg-transparent text-center dark:border-stone-700" />
						<PageNav.Next class={big}><span class="icon-[lucide--chevron-right] size-4"></span></PageNav.Next>
						<button class={big} aria-label="Notes" onclick={() => (sheet = 'notes')}><span class="icon-[lucide--message-square-text] size-5"></span><span class="sr-only">{annotations.length} notes</span></button>
						<button class={big} aria-label="Night mode" onclick={() => (night = !night)}><span class={[night ? 'icon-[lucide--sun]' : 'icon-[lucide--moon]', 'size-5']}></span></button>
					</nav>

					{#if sheet}
						<button class="absolute inset-0 z-40 bg-black/30" aria-label="Close" onclick={() => (sheet = null)}></button>
						<section class="absolute inset-x-0 bottom-0 z-50 max-h-[70%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-stone-900" aria-label={sheet}>
							<div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-stone-300"></div>
							{#if sheet === 'contents'}
								<Toc.Tree class="text-[15px] [--pdf-toc-indent:16px] [&_[data-pdf-toc-item]]:py-2.5 [&_[data-pdf-toc-item]]:pl-2" />
							{:else}
								<Annotations.List class="space-y-2">
									{#snippet item({ annotation, quote, go, color })}
										<button class="block w-full rounded-xl border-l-4 bg-stone-50 p-3 text-left dark:bg-stone-800" style:border-color={color} onclick={() => ((sheet = null), go())}>
											{#if quote}<p class="line-clamp-3 font-serif">{quote}</p>{/if}
											{#if annotation.contents}<p class="mt-1 text-sm">{annotation.contents}</p>{/if}
										</button>
									{/snippet}
									{#snippet empty()}<p class="py-6 text-center text-stone-500">Long-press text to select it, then pick a colour.</p>{/snippet}
								</Annotations.List>
							{/if}
						</section>
					{/if}
					<Annotations.SelectionMenu placement="bottom" />
					<Annotations.Popover />
					<Paper.CitationCard />
				</Annotations.Root>
			</Paper.Root>
		</Viewer.Root>
	</Document.Root>
</div>
