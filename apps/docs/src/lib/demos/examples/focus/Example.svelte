<script module lang="ts">
	export const meta = {
		title: 'Focus & navigation',
		description: 'viewer.focus() on a page, a PDF-space rect or a named destination, with padding around the target and a short highlight. Targets come from the paper model (figures, tables, sections) and the text index (equations, paragraphs). Built-in effects are CSS; the "recipe" effects are a layer built on the headless Viewer.Focus with its child snippet.',
		order: 4,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Slider } from 'bits-ui';
	import {
		Document,
		Paper,
		Viewer,
		listNamedDestinations,
		quadsBounds,
		searchPageText,
		type FocusHighlight,
		type PDFDocumentProxy,
		type PdfRect,
		type PaperState,
		type ViewerState
	} from 'svelte-pdf-mini';
	import FocusEffect, { focusRecipes } from '#lib/demos/components/ui/focus/FocusEffect.svelte';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let viewer = $state<ViewerState>();
	let paper = $state<PaperState>();
	let dests = $state<string[]>([]);
	let filter = $state('section');
	let effect = $state<FocusHighlight>('glow');
	let padding = $state(8);
	let duration = $state(1800);
	const builtins = ['pulse', 'outline', 'spotlight'] as const;
	const shown = $derived(dests.filter((d) => d.startsWith(filter)).slice(0, 200));
	const prefixes = ['section', 'subsection', 'figure', 'table', 'equation', 'cite'];

	async function onLoad(doc: PDFDocumentProxy) {
		dests = await listNamedDestinations(doc);
	}

	const focusRect = (page: number, rect: PdfRect) => viewer?.focus({ page, rect }, { behavior: 'smooth', highlight: effect, padding, duration });

	/** Rect of a text quote (first match), via the text index. `wholeLines` widens it to its lines. */
	async function quoteRect(query: string, pages: number[]): Promise<{ page: number; rect: PdfRect } | null> {
		for (const n of pages) {
			const text = await viewer!.document.getPageText(n);
			const [hit] = searchPageText(text, query);
			if (hit) {
				const rect = quadsBounds(text.quadsFor(hit.start, hit.end));
				if (rect) return { page: n, rect };
			}
		}
		return null;
	}

	interface Target {
		label: string;
		hint: string;
		go: () => Promise<unknown> | void;
	}
	const targets = $derived.by((): Target[] => {
		const p = paper;
		if (!p?.model) return [];
		const fig = (label: string) => p.figures.find((f) => f.label === label);
		const section = p.flatSections.find((s) => s.number === '3.2') ?? p.flatSections[1];
		const list: Target[] = [];
		for (const label of ['Figure 1', 'Table 3']) {
			const f = fig(label);
			if (f) list.push({ label, hint: `paper.figures · p.${f.page}`, go: () => focusRect(f.page, f.rect) });
		}
		if (section?.rect) list.push({ label: `Section ${section.number ?? ''} title`, hint: 'paper.sections', go: () => focusRect(section.page, section.rect!) });
		list.push({
			label: 'Equation 1',
			hint: 'text index search',
			go: async () => {
				const r = await quoteRect('softmax(', [4, 3, 5]);
				if (r) await focusRect(r.page, [r.rect[0] - 160, r.rect[1] - 8, r.rect[2] + 140, r.rect[3] + 6]);
			}
		});
		list.push({
			label: 'A paragraph',
			hint: 'text index: a whole quote',
			go: async () => {
				const r = await quoteRect('Recurrent models typically factor computation along the symbol positions of the input and output sequences', [2]);
				const end = await quoteRect('the fundamental constraint of sequential computation, however, remains', [2]);
				if (r) focusRect(r.page, end ? [Math.min(r.rect[0], end.rect[0]), end.rect[1], Math.max(r.rect[2], end.rect[2]), r.rect[3]] : r.rect);
			}
		});
		return list;
	});
	const chip = 'rounded-md px-2 py-1 text-xs data-[active]:bg-stone-900 data-[active]:text-white dark:data-[active]:bg-stone-100 dark:data-[active]:text-stone-900';
	const row = 'flex w-full items-center justify-between rounded-md border border-stone-200 px-2.5 py-1.5 text-left hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800';
</script>

<Document.Root src={defaultPaper} {onLoad}>
	<div class="flex h-full">
		<aside class="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-stone-200 p-3 text-sm dark:border-stone-800">
			<section class="space-y-2">
				<h2 class="font-medium">Effect</h2>
				<p class="text-xs text-stone-500">Built-in (CSS on <code>[data-highlight]</code>)</p>
				<div class="flex flex-wrap gap-1">
					{#each builtins as e (e)}<button class={chip} data-active={effect === e || undefined} onclick={() => (effect = e)}>{e}</button>{/each}
				</div>
				<p class="text-xs text-stone-500">Recipes (<code>ui/focus/FocusEffect.svelte</code>, child snippet)</p>
				<div class="flex flex-wrap gap-1">
					{#each focusRecipes as e (e)}<button class={chip} data-active={effect === e || undefined} onclick={() => (effect = e)}>{e}</button>{/each}
				</div>
			</section>
			<section class="space-y-3">
				<div class="space-y-1">
					<p class="flex justify-between text-xs text-stone-500"><span>Padding around the target</span><span class="tabular-nums">{padding} pt</span></p>
					<Slider.Root type="single" min={0} max={24} step={1} bind:value={padding} aria-label="Focus padding" class="relative flex h-4 touch-none items-center">
						<span class="relative h-1 w-full rounded-full bg-stone-200 dark:bg-stone-700"><Slider.Range class="absolute h-full rounded-full bg-stone-500" /></span>
						<Slider.Thumb index={0} class="block size-4 rounded-full border border-stone-300 bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
					</Slider.Root>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-xs text-stone-500">Duration</span>
					<ToggleGroup label="Duration" bind:value={() => String(duration), (v) => (duration = Number(v))} items={[{ value: '900', label: 'Short' }, { value: '1800', label: 'Default' }, { value: '3200', label: 'Long' }]} />
				</div>
			</section>
			<section class="space-y-1.5">
				<h2 class="font-medium">From the paper</h2>
				{#each targets as t (t.label)}
					<button class={row} onclick={t.go}><span>{t.label}</span><span class="text-[11px] text-stone-400">{t.hint}</span></button>
				{:else}
					<p class="text-xs text-stone-500">Analysing the paper…</p>
				{/each}
			</section>
			<section class="flex min-h-0 flex-col gap-2">
				<h2 class="font-medium">Named destinations <span class="text-stone-500">({dests.length})</span></h2>
				<div class="flex flex-wrap gap-1">
					{#each prefixes as p (p)}<button class={chip} data-active={filter === p || undefined} onclick={() => (filter = p)}>{p}</button>{/each}
				</div>
				<ul class="space-y-0.5">
					{#each shown as d (d)}
						<li><button class="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs hover:bg-stone-100 dark:hover:bg-stone-800" onclick={() => viewer?.focus({ dest: d }, { behavior: 'smooth', highlight: effect, duration })}>{d}</button></li>
					{/each}
				</ul>
			</section>
		</aside>
		<Viewer.Root bind:viewer zoomMode="page-width" class="min-w-0 flex-1">
			<Paper.Root bind:paper>
				<Viewer.Viewport class="h-full bg-stone-100 dark:bg-stone-900">
					<Viewer.Pages>
						{#snippet children({ pageNumber })}
							<Viewer.Page {pageNumber}>
								<Viewer.Canvas />
								<Viewer.TextLayer />
								<FocusEffect />
							</Viewer.Page>
						{/snippet}
					</Viewer.Pages>
				</Viewer.Viewport>
			</Paper.Root>
		</Viewer.Root>
	</div>
</Document.Root>
