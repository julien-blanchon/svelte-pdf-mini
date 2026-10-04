<script module lang="ts">
	export const meta = {
		title: 'Paper reader',
		description: 'A complete Scholar-class research reader: contents, outline, figures, references and notes panels; citation cards and figure previews; find; highlights with side notes (select text, then H / U / S / C or a colour 1–9); reading position in the URL; paper reading themes; export to PDF or Markdown.',
		order: 100,
		kind: 'app'
	} as const;
	import PdfContextMenu from '#lib/demos/components/pdf/PdfContextMenu.svelte';
	import ShortcutsDialog from '#lib/demos/components/pdf/ShortcutsDialog.svelte';
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		Annotations,
		Document,
		Find,
		Outline,
		PageNav,
		Paper,
		Thumbnails,
		Toc,
		Viewer,
		Zoom,
		defaultCitationProvider,
		type Annotation,
		type AnnotationStore,
		type Columns,
		type ViewerState
	} from 'svelte-pdf-mini';
	import AnnotationFilters from '#lib/demos/components/pdf/AnnotationFilters.svelte';
	import AnnotationToolbar from '#lib/demos/components/pdf/AnnotationToolbar.svelte';
	import ThemePopover from '#lib/demos/components/pdf/ThemePopover.svelte';
	import { ReadingTheme } from '#lib/demos/components/pdf/reading-theme.svelte.ts';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import { download, loadAnnotations, saveAnnotations } from '#lib/demos/components/pdf/persist.ts';
	import Button from '#lib/demos/components/ui/Button.svelte';
	import Kbd from '#lib/demos/components/ui/Kbd.svelte';
	import Menu from '#lib/demos/components/ui/Menu.svelte';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import Tabs from '#lib/demos/components/ui/Tabs.svelte';
	import Tip from '#lib/demos/components/ui/Tip.svelte';
	import { arxivPdf, papers } from '#lib/demos/papers.ts';

	// ?paper=<arxiv id> picks the paper (the library app links here).
	// (Read in the browser: the page is prerendered, so the query string isn't known at build time.)
	let paperId = $state(papers[0].id);
	$effect.pre(() => {
		const fromUrl = untrack(() => new URL(location.href).searchParams.get('paper'));
		if (fromUrl && papers.some((p) => p.id === fromUrl)) untrack(() => (paperId = fromUrl));
	});
	let viewer = $state<ViewerState>();
	let store = $state<AnnotationStore>();
	let annotations = $state<Annotation[]>([]);
	let columns = $state<Columns>(1);
	type Panel = 'contents' | 'outline' | 'pages' | 'figures' | 'references' | 'notes';
	let panel = $state<Panel>('contents');
	let panelOpen = $state(true);
	let findOpen = $state(false);
	let findInput = $state<HTMLInputElement | null>(null);
	let toolsOpen = $state(false);
	const theme = new ReadingTheme({ color: 'warm', strength: 0.45 });
	const provider = defaultCitationProvider();
	const fingerprint = $derived(viewer?.document.fingerprint ?? null);
	const tabs = $derived([
		{ value: 'contents' as Panel, label: 'Contents', icon: icons.list },
		{ value: 'outline' as Panel, label: 'Outline', icon: icons.book },
		{ value: 'pages' as Panel, label: 'Pages', icon: icons.layers },
		{ value: 'figures' as Panel, label: 'Figures', icon: 'icon-[lucide--image]' },
		{ value: 'references' as Panel, label: 'Refs', icon: 'icon-[lucide--quote]' },
		{ value: 'notes' as Panel, label: annotations.length ? `Notes ${annotations.length}` : 'Notes', icon: icons.notes }
	]);

	// Load saved annotations for this PDF (keyed by fingerprint, so mirrors share them).
	$effect(() => {
		const fp = fingerprint;
		const s = store;
		if (fp && s) untrack(() => s.load(loadAnnotations(fp)));
	});

	// Restore #page=3.42 once the document is ready, then keep it updated.
	function restore() {
		const m = location.hash.match(/page=([\d.]+)/);
		if (m) viewer?.restorePosition(Number(m[1]));
	}
	let hashTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		void viewer?.readingPoint;
		clearTimeout(hashTimer);
		hashTimer = setTimeout(() => {
			if (viewer?.document.status !== 'ready') return;
			const url = new URL(location.href);
			url.searchParams.set('paper', paperId);
			url.hash = `page=${viewer.position.toFixed(2)}`;
			goto(url, { replace: true, shallow: true, reset: false });
		}, 400);
	});

	// Ctrl/⌘ + F opens the find bar.
	async function openFind() {
		findOpen = true;
		await tick();
		findInput?.focus();
		findInput?.select();
	}
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
				e.preventDefault();
				openFind();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function exportPdf() {
		if (!store) return;
		download(await store.exportPdf(), `${paperId.replace('/', '_')}-annotated.pdf`, 'application/pdf');
	}
	function exportMarkdown(sections: { title: string; page: number; y: number }[], title?: string) {
		if (!store) return;
		download(store.toMarkdown({ title: title ?? paperId, sections }), `${paperId.replace('/', '_')}-notes.md`, 'text/markdown');
	}
	const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
	const iconBtn = 'grid size-8 place-items-center rounded-md text-stone-600 outline-none hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-35 data-[active]:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-700/60 dark:data-[active]:bg-stone-700';
</script>

<div class={['h-full', theme.dark && 'dark']}>
	<Document.Root src={arxivPdf(paperId)} onLoad={() => requestAnimationFrame(restore)}>
		<Viewer.Root bind:viewer bind:columns pageTheme={theme.strategy} pageFrame={theme.frame} theme={theme.dark ? 'dark' : 'light'} zoomMode="page-width" class="flex h-full flex-col bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
			<Find.Root>
				{#snippet children({ find })}
					<Paper.Root {provider}>
						{#snippet children({ paper })}
							<Annotations.Root bind:annotations bind:store author={{ name: 'You' }} onAnnotationsChange={(list) => saveAnnotations(fingerprint, list)}>
								<!-- ── Header ──────────────────────────────────────────── -->
								<header class="relative z-30 border-b border-stone-200 bg-stone-100/80 backdrop-blur dark:border-stone-800 dark:bg-stone-900/80">
									<div class="flex items-center gap-1 px-2 py-1.5">
										<Tip label={panelOpen ? 'Hide panel' : 'Show panel'}>
											{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Toggle panel" data-active={panelOpen || undefined} onclick={() => (panelOpen = !panelOpen)}><span class="{icons.panel} size-4"></span></button>{/snippet}
										</Tip>
										<select bind:value={paperId} class="max-w-52 truncate rounded-md bg-transparent px-1 py-1 text-sm font-medium" aria-label="Paper">
											{#each papers as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
										</select>
										<Toc.Breadcrumb class="hidden min-w-0 flex-1 truncate px-2 text-sm text-stone-500 lg:flex [&_[data-pdf-toc-item]]:truncate" />
										<span class="flex-1 lg:hidden"></span>
										<div class="flex items-center gap-0.5">
											<Tip label="Previous page">{#snippet child({ props })}<PageNav.Prev {...props} class={iconBtn}><span class="{icons.prev} size-4"></span></PageNav.Prev>{/snippet}</Tip>
											<PageNav.Input class="h-7 w-10 rounded-md border border-stone-300 bg-white text-center text-sm dark:border-stone-700 dark:bg-stone-800" />
											<span class="px-1 text-sm text-stone-500">/ {viewer?.document.numPages ?? '–'}</span>
											<Tip label="Next page">{#snippet child({ props })}<PageNav.Next {...props} class={iconBtn}><span class="{icons.next} size-4"></span></PageNav.Next>{/snippet}</Tip>
										</div>
										<Separator />
										<Tip label="Zoom out" shortcut="{mod}−">{#snippet child({ props })}<Zoom.Out {...props} class={iconBtn}><span class="{icons.zoomOut} size-4"></span></Zoom.Out>{/snippet}</Tip>
										<Zoom.Select class="h-8 rounded-md bg-transparent px-1 text-sm" />
										<Tip label="Zoom in" shortcut="{mod}+">{#snippet child({ props })}<Zoom.In {...props} class={iconBtn}><span class="{icons.zoomIn} size-4"></span></Zoom.In>{/snippet}</Tip>
										<Menu
											label="Layout"
											items={[
												{ heading: 'Pages per row', label: 'Single page', checked: columns === 1, onSelect: () => (columns = 1) },
												{ label: 'Two pages', checked: columns === 2, onSelect: () => (columns = 2) },
												{ label: 'Auto (zoom out for more)', checked: columns === 'auto', onSelect: () => (columns = 'auto') }
											]}
										>
											{#snippet trigger()}<span class="{icons.columns} size-4"></span>{/snippet}
										</Menu>
										<ThemePopover {theme} />
										<Tip label="Find" shortcut="{mod}F">
											{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Find" data-active={findOpen || undefined} onclick={() => (findOpen ? (findOpen = false) : openFind())}><span class="{icons.search} size-4"></span></button>{/snippet}
										</Tip>
										<Tip label="Annotation tools">
											{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Annotation tools" data-active={toolsOpen || undefined} onclick={() => (toolsOpen = !toolsOpen)}><span class="{icons.annotate} size-4"></span></button>{/snippet}
										</Tip>
										<Menu
											label="Export"
											items={[
												{ label: 'PDF with annotations', icon: icons.download, onSelect: exportPdf },
												{ label: 'Notes as Markdown', icon: 'icon-[lucide--file-text]', onSelect: () => exportMarkdown(paper.flatSections.map((s) => ({ title: s.title, page: s.page, y: s.y })), paper.meta?.title) },
												{ label: store?.notesVisible === false ? 'Show side notes' : 'Hide side notes', icon: store?.notesVisible === false ? icons.eye : icons.eyeOff, separatorBefore: true, onSelect: () => store && (store.notesVisible = !store.notesVisible) }
											]}
										>
											{#snippet trigger()}<span class="{icons.more} size-4"></span>{/snippet}
										</Menu>
									</div>
									{#if toolsOpen || findOpen}
										<div class="flex flex-wrap items-center gap-3 border-t border-stone-200 px-3 py-1.5 dark:border-stone-800" transition:fly={{ y: -6, duration: 140 }}>
											{#if toolsOpen}
												<AnnotationToolbar />
												<AnnotationFilters />
												<span class="hidden items-center gap-1 text-xs text-stone-500 2xl:flex">Select text, then <Kbd>H</Kbd><Kbd>U</Kbd><Kbd>S</Kbd><Kbd>C</Kbd> or <Kbd>1</Kbd>–<Kbd>9</Kbd> · click to select</span>
											{/if}
											{#if findOpen}
												<div class="ml-auto flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 dark:border-stone-700 dark:bg-stone-800">
													<span class="{icons.search} size-3.5 text-stone-400"></span>
													<Find.Input bind:ref={findInput} captureShortcut={false} class="w-56 bg-transparent py-1 text-sm outline-none" placeholder="Find in paper…" />
													<Find.Count class="text-xs text-stone-500 tabular-nums" />
													<Find.Prev class="grid size-6 place-items-center rounded disabled:opacity-30"><span class="{icons.up} size-4"></span></Find.Prev>
													<Find.Next class="grid size-6 place-items-center rounded disabled:opacity-30"><span class="{icons.down} size-4"></span></Find.Next>
													<button class="grid size-6 place-items-center rounded text-stone-400" aria-label="Close find" onclick={() => ((findOpen = false), find.clear())}><span class="{icons.close} size-4"></span></button>
												</div>
											{/if}
										</div>
									{/if}
									<Toc.Progress class="rounded-none! [--pdf-progress-height:3px]" />
								</header>

								<div class="flex min-h-0 flex-1">
									<!-- ── Side panel (bits-ui Tabs recipe) ───────────────── -->
									{#if panelOpen}
										<aside class="flex w-80 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 text-sm dark:border-stone-800 dark:bg-stone-900/60" transition:fly={{ x: -16, duration: 150 }}>
											<Tabs bind:value={panel} {tabs} class="min-h-0 flex-1" listClass="m-2">
												{#snippet content(id)}
													<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
														{#if id === 'contents'}
															{#if paper.meta?.title}<p class="px-2 pt-1 pb-2 font-serif text-[15px] leading-snug">{paper.meta.title}</p>{/if}
															<Toc.Tree class="[--pdf-toc-indent:14px] [&_[data-pdf-toc-item]]:pl-2">
																{#snippet empty({ status })}<p class="p-2 text-stone-500">{status === 'analyzing' ? 'Reading the paper…' : 'No sections found.'}</p>{/snippet}
															</Toc.Tree>
														{:else if id === 'outline'}
															<Outline.Root>
																<Outline.Tree class="[--pdf-outline-indent:12px] [&_[data-pdf-outline-item]]:truncate [&_[data-pdf-outline-item]]:rounded [&_[data-pdf-outline-item]]:px-1.5 [&_[data-pdf-outline-item]]:py-1 [&_[data-pdf-outline-item][data-active]]:font-semibold [&_[data-pdf-outline-item][data-active]]:text-blue-700 dark:[&_[data-pdf-outline-item][data-active]]:text-blue-300 [&_[data-pdf-outline-toggle]]:w-5 [&_[data-pdf-outline-toggle]]:text-stone-400">
																	{#snippet empty()}<p class="p-2 text-stone-500">This PDF has no bookmarks — see Contents.</p>{/snippet}
																</Outline.Tree>
															</Outline.Root>
														{:else if id === 'pages'}
															<Thumbnails.Root width={140} class="space-y-2 pt-1">
																{#each { length: viewer?.document.numPages ?? 0 } as _, i (i)}
																	<Thumbnails.Item pageNumber={i + 1} class="mx-auto flex flex-col items-center gap-1 rounded-md p-1.5 text-xs text-stone-500 data-[current]:bg-stone-300/60 dark:data-[current]:bg-stone-700 [&_[data-pdf-thumbnail-canvas]]:shadow" />
																{/each}
															</Thumbnails.Root>
														{:else if id === 'figures'}
															<Paper.Figures thumbnailWidth={290} class="space-y-3 pt-1 [&_[data-part=open]]:block [&_[data-part=open]]:w-full [&_[data-part=open]]:rounded-md [&_[data-part=open]]:p-1.5 [&_[data-part=open]]:text-left [&_[data-part=open]:hover]:bg-stone-200/70 dark:[&_[data-part=open]:hover]:bg-stone-800 [&_[data-part=label]]:mt-1 [&_[data-part=label]]:block [&_[data-part=label]]:font-medium [&_[data-part=caption]]:line-clamp-2 [&_[data-part=caption]]:text-xs [&_[data-part=caption]]:text-stone-500 [&_[data-part=thumbnail]]:min-h-12 [&_[data-part=thumbnail]]:overflow-hidden [&_[data-part=thumbnail]]:rounded [&_[data-part=thumbnail]]:bg-white" />
														{:else if id === 'references'}
															<Paper.References class="space-y-0.5 pt-1">
																{#snippet item({ reference, citedCount, go, nextCitation })}
																	<div class="rounded-md px-2 py-1.5 hover:bg-stone-200/70 dark:hover:bg-stone-800">
																		<button class="block w-full text-left" onclick={go}>
																			<span class="mr-1 font-mono text-[11px] text-stone-500">{reference.label}</span>
																			<span class="font-medium">{reference.parsed.title ?? reference.raw.slice(0, 120)}</span>
																			<span class="block text-xs text-stone-500">{reference.parsed.authors.slice(0, 3).join(', ')}{reference.parsed.year ? ` · ${reference.parsed.year}` : ''}</span>
																		</button>
																		{#if citedCount}<button class="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline dark:text-blue-300" onclick={nextCitation}>cited {citedCount}× <span class="{icons.down} size-3"></span></button>{/if}
																	</div>
																{/snippet}
															</Paper.References>
														{:else}
															<div class="flex items-center justify-between px-1 pt-1 pb-2 text-xs text-stone-500">
																<span>{annotations.length} note{annotations.length === 1 ? '' : 's'} · saved in this browser</span>

															</div>
															<Annotations.List class="space-y-2">
																{#snippet item({ annotation, quote, pageLabel, go, color })}
																	<button class="block w-full rounded-md border-l-4 bg-white px-2.5 py-2 text-left shadow-sm hover:shadow dark:bg-stone-800" style:border-color={color} onclick={go}>
																		<span class="text-[11px] text-stone-500 uppercase">p. {pageLabel} · {annotation.kind}</span>
																		{#if annotation.label}<span class="block font-medium">{annotation.label}</span>{/if}
																		{#if quote}<span class="line-clamp-3 block font-serif text-[13px] text-stone-600 dark:text-stone-300">{quote}</span>{/if}
																		{#if annotation.contents}<span class="mt-1 block border-t border-stone-200 pt-1 text-[13px] dark:border-stone-700"><Annotations.Markdown source={annotation.contents} /></span>{/if}
																	</button>
																{/snippet}
																{#snippet empty()}
																	<p class="flex flex-wrap items-center gap-1 p-2 text-stone-500">Select text, then press <Kbd>H</Kbd> to highlight (or a colour <Kbd>1</Kbd>–<Kbd>9</Kbd>). Click an annotation to select it.</p>
																{/snippet}
															</Annotations.List>
														{/if}
													</div>
												{/snippet}
											</Tabs>
										</aside>
									{/if}

									<!-- ── Pages ───────────────────────────────────────────── -->
									<div class="relative min-w-0 flex-1">
										<!-- --pdf-pages-aside: room for side notes; pages stay centred while it fits (fit-to-width accounts for it). -->
										<PdfContextMenu>
											{#snippet trigger({ props })}
												<Viewer.Viewport {...props} class="h-full bg-stone-200/60 dark:bg-stone-900 [--pdf-page-gap:20px] [--pdf-pages-padding:24px] {store?.notesVisible === false ? '' : '[--pdf-pages-aside:272px]'}">
													<Viewer.Pages>
														{#snippet children({ pageNumber })}
															<Viewer.Page {pageNumber}>
																<Viewer.Canvas />
																<Viewer.TextLayer />
																<Viewer.LinkLayer />
																<Find.Layer />
																<Paper.Layer />
																<Annotations.Layer />
																<Annotations.LineMarkers markers="all" />
																<Annotations.Margin class="[--pdf-margin-width:240px]" />
																<Viewer.Focus />
															</Viewer.Page>
														{/snippet}
													</Viewer.Pages>
												</Viewer.Viewport>
											{/snippet}
										</PdfContextMenu>
										<ShortcutsDialog />
										<Toc.Rail class="absolute top-8 right-3 bottom-8 text-stone-500" />
										<Viewer.BackButton class="absolute bottom-6 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stone-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur dark:bg-stone-100/90 dark:text-stone-900">
											{#snippet children({ label })}<span class="{icons.back} size-4"></span> Back to page {label}{/snippet}
										</Viewer.BackButton>
										{#if paper.status === 'analyzing'}
											<div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/70 px-3 py-1 text-xs text-white">Reading the paper… {Math.round(paper.progress * 100)}%</div>
										{/if}
									</div>
								</div>

								<Paper.CitationCard />
								<Paper.CrossRefPreview />
								<Viewer.LinkPreview kinds={['section', 'equation', 'footnote', 'page', 'other', 'url']} />
								<Annotations.SelectionMenu />
								<Annotations.Popover />
								<!-- Hovering a highlight shows its note, with an enter/exit transition (forceMount + child). -->
								<Annotations.HoverCard forceMount>
									{#snippet child({ props, open, annotation, color })}
										{#if open}
											<div {...props} transition:fly={{ y: 6, duration: 140 }} class="max-w-80 rounded-lg border border-stone-200 bg-white/95 px-3 py-2 text-sm shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
												<div class="mb-1 flex items-center gap-1.5 text-[11px] text-stone-500"><span class="size-2 rounded-full" style:background={color}></span>{annotation.author?.name ?? 'Note'}{#if annotation.label} · {annotation.label}{/if}</div>
												{#if annotation.contents}<div class="text-stone-800 dark:text-stone-100"><Annotations.Markdown source={annotation.contents} /></div>{/if}
											</div>
										{/if}
									{/snippet}
								</Annotations.HoverCard>
							</Annotations.Root>
						{/snippet}
					</Paper.Root>
				{/snippet}
			</Find.Root>
		</Viewer.Root>
	</Document.Root>
</div>
