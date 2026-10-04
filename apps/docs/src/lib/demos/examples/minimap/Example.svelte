<script module lang="ts">
	export const meta = {
		title: 'Minimap',
		description: 'A code-editor style minimap you can put anywhere, in five looks: bitmap pages, plain blocks, text structure, section spine and a marker heatmap. Drag the viewport, click to jump, wheel to scroll, or focus it and use the arrow / Page / Home / End keys.',
		order: 7.5,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	/** Strip width per variant (px); others use 96. */
	const STRIP_WIDTH: Partial<Record<MinimapVariant, number>> = { heatmap: 18, spine: 120 };
	import { Annotations, Document, Find, Minimap, Paper, Viewer, defaultPalette, type Annotation, type MinimapVariant } from 'svelte-pdf-mini';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { arxivPdf } from '#lib/demos/papers.ts';

	let query = $state('few-shot');
	let variant = $state<MinimapVariant>('pages');
	let fit = $state(false);
	let freeWheel = $state(false);
	const now = new Date().toISOString();
	// A few annotations so the minimap has something to show besides find hits.
	let annotations = $state<Annotation[]>(
		[3, 5, 8].map((page, i) => ({
			id: `demo-${i}`,
			page,
			kind: 'area',
			rect: [70, 500 - i * 120, 520, 600 - i * 120],
			color: defaultPalette[i + 1].rgb,
			paletteKey: defaultPalette[i + 1].key,
			opacity: 1,
			label: `Note ${i + 1}`,
			createdAt: now,
			modifiedAt: now
		}))
	);
	const variants: { value: MinimapVariant; label: string; note: string }[] = [
		{ value: 'pages', label: 'Pages', note: 'Bitmap previews, closest to the document. Turns into blocks automatically when pages get too small to read (whole-document view), so nothing useless is rendered.' },
		{ value: 'blocks', label: 'Blocks', note: 'Plain numbered blocks: no rendering at all, best for very long documents and for a "where am I" scrollbar.' },
		{ value: 'text', label: 'Text structure', note: 'Drawn from the text index like VS Code’s character minimap: lines as bars, headings darker, figures as filled blocks. Readable at sizes where bitmaps are mush, and cheap (no pdf.js rendering).' },
		{ value: 'spine', label: 'Section spine', note: 'One band per top-level section with its title: a navigation outline that doubles as a scrollbar. Needs Paper.Root (falls back to pages).' },
		{ value: 'heatmap', label: 'Heatmap', note: 'No pages: marker density (find hits + annotations) along the document, for spotting where the action is.' }
	];
	const current = $derived(variants.find((v) => v.value === variant)!);
</script>

<Document.Root src={arxivPdf('2005.14165')}>
	<Viewer.Root zoomMode="page-width" class="flex h-full flex-col">
		<Paper.Root>
			<Find.Root bind:query>
				<Annotations.Root bind:annotations>
					<div class="space-y-2 border-b border-stone-200 p-2 text-sm dark:border-stone-800">
						<div class="flex flex-wrap items-center gap-3">
							<label class="flex items-center gap-1 rounded-md border border-stone-300 px-2 dark:border-stone-700">
								<span class="{icons.search} size-4 text-stone-400"></span>
								<Find.Input class="w-40 bg-transparent py-1 outline-none" placeholder="Find…" />
								<Find.Count class="text-xs text-stone-500 tabular-nums" />
							</label>
							<ToggleGroup label="Minimap look" bind:value={variant} items={variants.map(({ value, label }) => ({ value, label }))} />
							<label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={fit} /> Whole document</label>
							<label class="flex items-center gap-1.5" title="Wheel over the strip scrolls the strip instead of the document"><input type="checkbox" bind:checked={freeWheel} /> Free strip scrolling</label>
						</div>
						<p class="text-xs text-stone-500"><strong class="font-medium text-stone-700 dark:text-stone-300">{current.label}:</strong> {current.note}</p>
					</div>
					<div class="flex min-h-0 flex-1">
						<Viewer.Viewport class="min-w-0 flex-1 bg-stone-100 dark:bg-stone-900">
							<Viewer.Pages>
								{#snippet children({ pageNumber })}
									<Viewer.Page {pageNumber}>
										<Viewer.Canvas />
										<Viewer.TextLayer />
										<Find.Layer />
										<Annotations.Layer />
									</Viewer.Page>
								{/snippet}
							</Viewer.Pages>
						</Viewer.Viewport>
						<Minimap.Root {variant} width={STRIP_WIDTH[variant] ?? 96} mode={fit ? 'fit' : 'scroll'} wheel={freeWheel ? 'strip' : 'document'} class="h-full shrink-0 border-l border-stone-200 dark:border-stone-800 [--pdf-minimap-page-opacity:0.9]">
							{#if variant === 'heatmap'}<Minimap.Heatmap />{/if}
							<Minimap.Viewport class="rounded-sm! bg-sky-500/15! shadow-[inset_0_0_0_1.5px_rgb(14_165_233/0.6)]!" />
							{#if variant !== 'heatmap'}<Minimap.Markers find annotations sections={variant !== 'spine'} />{/if}
						</Minimap.Root>
					</div>
				</Annotations.Root>
			</Find.Root>
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
