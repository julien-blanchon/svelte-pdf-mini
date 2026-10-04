<script module lang="ts">
	export const meta = {
		title: 'Annotator',
		description: 'An annotation workspace: every tool, a notes sidebar with crops and filters, side notes, autosave in this browser, export to PDF / Markdown / JSON, and import of annotated PDFs (drop one here).',
		order: 101,
		kind: 'app'
	} as const;
	import PdfContextMenu from '#lib/demos/components/pdf/PdfContextMenu.svelte';
	import ShortcutsDialog from '#lib/demos/components/pdf/ShortcutsDialog.svelte';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { Annotations, Document, Viewer, defaultPalette, type Annotation, type AnnotationKind, type AnnotationStore, type PdfSource, type ViewerState } from 'svelte-pdf-mini';
	import AnnotationColorPicker from '#lib/demos/components/pdf/AnnotationColorPicker.svelte';
	import AnnotationFilters from '#lib/demos/components/pdf/AnnotationFilters.svelte';
	import AnnotationToolbar from '#lib/demos/components/pdf/AnnotationToolbar.svelte';
	import NoteHoverCard from '#lib/demos/components/pdf/NoteHoverCard.svelte';
	import WorkflowHints from '#lib/demos/components/pdf/WorkflowHints.svelte';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import Button from '#lib/demos/components/ui/Button.svelte';
	import Menu from '#lib/demos/components/ui/Menu.svelte';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import { download, loadAnnotations, saveAnnotations } from '#lib/demos/components/pdf/persist.ts';
	import { arxivPdf } from '#lib/demos/papers.ts';

	let src = $state<PdfSource>(arxivPdf('1512.03385'));
	let fileName = $state('resnet.pdf');
	let importing = $state(false);
	let viewer = $state<ViewerState>();
	let store = $state<AnnotationStore>();
	let annotations = $state<Annotation[]>([]);
	let kindFilter = $state<'all' | 'markup' | 'area' | 'note' | 'drawing'>('all');
	let colorFilter = $state<string | null>(null);
	let dragging = $state(false);
	let message = $state('');
	let palette = $state(defaultPalette);

	const fingerprint = $derived(viewer?.document.fingerprint ?? null);
	const groups: Record<string, AnnotationKind[]> = {
		markup: ['highlight', 'underline', 'strikeout', 'squiggly'],
		area: ['area'],
		note: ['note', 'freetext'],
		drawing: ['ink', 'rect', 'ellipse', 'line', 'arrow', 'polygon', 'polyline']
	};
	const filter = (a: Annotation) => (kindFilter === 'all' || groups[kindFilter].includes(a.kind)) && (!colorFilter || a.paletteKey === colorFilter);

	// Saved annotations for this PDF (a dropped PDF uses its own annotations instead).
	$effect(() => {
		const fp = fingerprint;
		const s = store;
		if (fp && s && !importing) untrack(() => s.load(loadAnnotations(fp, 'annotator')));
	});

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const f = e.dataTransfer?.files[0];
		if (!f || f.type !== 'application/pdf') return;
		importing = true;
		fileName = f.name;
		src = f;
	}
	const base = () => fileName.replace(/\.pdf$/i, '');
	const chip = 'rounded-full px-2 py-0.5 text-xs capitalize text-stone-600 data-[active]:bg-stone-800 data-[active]:text-white dark:text-stone-300 dark:data-[active]:bg-stone-200 dark:data-[active]:text-stone-900';
</script>

<div
	class="relative flex h-full flex-col bg-stone-50 dark:bg-stone-950"
	role="region"
	aria-label="Annotator (drop a PDF)"
	ondragover={(e) => ((e.preventDefault(), (dragging = true)))}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
>
	<Document.Root {src}>
		<Viewer.Root bind:viewer zoomMode="page-width" class="flex min-h-0 flex-1 flex-col">
			<Annotations.Root
				bind:annotations
				bind:store
				importFromPdf={importing}
				foreign="editable"
				bind:palette
				author={{ name: 'You' }}
				onAnnotationsChange={(list) => saveAnnotations(fingerprint, list, 'annotator')}
				onImport={(r) => (message = `Imported ${r.annotations.length} annotations from ${fileName} (${r.foreign} from other apps). The file's own annotations are now editable here.`)}
			>
				<header class="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-1.5 dark:border-stone-800">
					<AnnotationToolbar colors={false} />
					<Separator />
					<AnnotationColorPicker />
					<span class="flex-1"></span>
					<span class="text-xs text-stone-500">{fileName}</span>
					{#if store}
						<AnnotationFilters />
					{/if}
					<Menu
						label="Export"
						triggerClass="border border-stone-300 dark:border-stone-700"
						items={[
							{ label: 'PDF with annotations', icon: icons.download, onSelect: async () => download(await store!.exportPdf(), `${base()}-annotated.pdf`, 'application/pdf') },
							{ label: 'Markdown notes', icon: 'icon-[lucide--file-text]', onSelect: () => download(store!.toMarkdown({ title: base() }), `${base()}-notes.md`, 'text/markdown') },
							{ label: 'JSON', icon: 'icon-[lucide--braces]', onSelect: () => download(JSON.stringify(store!.toJSON(), null, 2), `${base()}-annotations.json`, 'application/json') }
						]}
					>
						{#snippet trigger()}<span class="{icons.download} size-4"></span> Export{/snippet}
					</Menu>
				</header>
				<div class="border-b border-stone-200 bg-stone-100/60 px-3 py-1 dark:border-stone-800 dark:bg-stone-900"><WorkflowHints /></div>
				{#if message}<p class="border-b border-stone-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-900 dark:border-stone-800 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>{/if}
				<div class="flex min-h-0 flex-1">
					<!-- Right padding leaves room for side notes; fit-to-width accounts for it. -->
					<PdfContextMenu>
						{#snippet trigger({ props })}
							<Viewer.Viewport {...props} class="min-w-0 flex-1 bg-stone-200/60 dark:bg-stone-900 [--pdf-pages-padding:16px] [--pdf-pages-aside:272px]">
								<Viewer.Pages>
									{#snippet children({ pageNumber })}
										<Viewer.Page {pageNumber}>
											<Viewer.Canvas />
											<Viewer.TextLayer />
											<Annotations.Layer />
											<Annotations.LineMarkers />
											<Annotations.Margin class="[--pdf-margin-width:240px]" />
										</Viewer.Page>
									{/snippet}
								</Viewer.Pages>
							</Viewer.Viewport>
						{/snippet}
					</PdfContextMenu>
					<ShortcutsDialog />
					<aside class="flex w-80 shrink-0 flex-col border-l border-stone-200 text-sm dark:border-stone-800">
						<div class="space-y-2 border-b border-stone-200 p-3 dark:border-stone-800">
							<p class="font-medium">Notes <span class="text-stone-500">{annotations.filter(filter).length}/{annotations.length}</span></p>
							<div class="flex flex-wrap gap-1">
								{#each ['all', 'markup', 'area', 'note', 'drawing'] as const as k (k)}
									<button class={chip} data-active={kindFilter === k || undefined} onclick={() => (kindFilter = k)}>{k}</button>
								{/each}
							</div>
							<div class="flex gap-1.5">
								{#each palette.slice(0, 8) as c (c.key)}
									<button aria-label="Only {c.label}" class="h-5 w-5 rounded-full ring-offset-2 data-[active]:ring-2 data-[active]:ring-stone-700" style:background={c.light} data-active={colorFilter === c.key || undefined} onclick={() => (colorFilter = colorFilter === c.key ? null : c.key)}></button>
								{/each}
							</div>
						</div>
						<Annotations.List {filter} class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
							{#snippet item({ annotation, quote, pageLabel, go, color, selected })}
								<button class="block w-full overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:shadow data-[selected]:ring-2 data-[selected]:ring-blue-500 dark:bg-stone-900" style:border-color={color} data-selected={selected || undefined} onclick={go}>
									<Annotations.Crop {annotation} width={286} class="max-h-28 overflow-hidden bg-white" />
									<div class="space-y-0.5 p-2">
										<p class="text-[11px] text-stone-500 uppercase">p. {pageLabel} · {annotation.kind}{annotation.origin === 'foreign' ? ' · imported' : ''}</p>
										{#if annotation.label}<p class="font-medium">{annotation.label}</p>{/if}
										{#if quote}<p class="line-clamp-2 font-serif text-[13px] text-stone-600 dark:text-stone-300">{quote}</p>{/if}
										{#if annotation.contents}<p class="text-[13px]">{annotation.contents}</p>{/if}
									</div>
								</button>
							{/snippet}
							{#snippet empty()}<p class="text-stone-500">Nothing yet. Select text and press H, or pick a tool (A box, P pen, N note). Double-click an annotation to edit it. Drop an annotated PDF to import it.</p>{/snippet}
						</Annotations.List>
					</aside>
				</div>
				<Annotations.SelectionMenu />
				<Annotations.Popover />
				<NoteHoverCard />
			</Annotations.Root>
		</Viewer.Root>
	</Document.Root>
	{#if dragging}
		<div class="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 text-blue-800">Drop an annotated PDF to import its annotations</div>
	{/if}
</div>
