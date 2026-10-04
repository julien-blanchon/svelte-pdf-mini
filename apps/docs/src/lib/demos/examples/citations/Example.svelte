<script module lang="ts">
	export const meta = {
		title: 'Citations, references & figures',
		description: 'Every [12] / (Author, 2020) becomes a link: hover for the full reference (parsed from the paper, enriched online), click to jump, Back to return. Groups like [1, 2, 3] can show every reference at once or page through them. Clicks and actions are yours to override (open the cited paper, import it…), and the card can be fully restyled with its own transitions.',
		order: 15,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { fly, scale } from 'svelte/transition';
	import { Document, Paper, Viewer, defaultCitationProvider, type Reference } from 'svelte-pdf-mini';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import Tabs from '#lib/demos/components/ui/Tabs.svelte';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { arxivPdf, papers } from '#lib/demos/papers.ts';

	let paperId = $state('1706.03762');
	let panel = $state<'references' | 'figures'>('references');
	let layout = $state<'auto' | 'list' | 'pager'>('auto');
	let clickAction = $state<'jump' | 'arxiv' | 'reader'>('jump');
	let design = $state<'default' | 'custom'>('default');
	let toast = $state<string | null>(null);
	const provider = defaultCitationProvider();

	function notify(msg: string) {
		toast = msg;
		setTimeout(() => toast === msg && (toast = null), 2500);
	}
	/** The app decides what a click on a reference does. Return false = skip the default jump. */
	function onReferenceClick(ref: Reference) {
		const arxivId = ref.parsed.arxivId;
		if (clickAction === 'arxiv' && arxivId) {
			window.open(`https://arxiv.org/abs/${arxivId}`, '_blank', 'noopener');
			return false;
		}
		if (clickAction === 'reader' && arxivId) {
			goto(`${resolve('/demo/[slug]', { slug: 'reader' })}?paper=${arxivId}`);
			return false;
		}
		if (clickAction !== 'jump') notify('No arXiv id for this reference: jumping to it instead.');
	}
	const importRef = (ref: Reference) => notify(`Imported “${ref.parsed.title ?? ref.label}” into your library (demo)`);
	const chipBtn = 'inline-flex items-center gap-1 rounded-md border border-stone-200 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800';
</script>

<Document.Root src={arxivPdf(paperId)}>
	<Viewer.Root zoomMode="page-width" class="flex h-full">
		<Paper.Root {provider}>
			{#snippet children({ paper })}
				<div class="relative min-w-0 flex-1">
					<Viewer.Viewport class="h-full bg-stone-100 dark:bg-stone-900">
						<Viewer.Pages>
							{#snippet children({ pageNumber })}
								<Viewer.Page {pageNumber}>
									<Viewer.Canvas />
									<Viewer.TextLayer />
									<Paper.Layer />
									<Viewer.Focus />
								</Viewer.Page>
							{/snippet}
						</Viewer.Pages>
					</Viewer.Viewport>
					<Viewer.BackButton class="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-black">
						{#snippet children({ label })}<span class="{icons.back} size-4"></span> Back to page {label}{/snippet}
					</Viewer.BackButton>
					{#if toast}
						<div transition:fly={{ y: 10, duration: 160 }} class="absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white shadow-lg">{toast}</div>
					{/if}
				</div>
				<aside class="flex w-96 shrink-0 flex-col border-l border-stone-200 text-sm dark:border-stone-800">
					<div class="space-y-3 border-b border-stone-200 p-3 dark:border-stone-800">
						<select bind:value={paperId} class="w-full rounded-md border border-stone-300 bg-transparent px-1 py-1 dark:border-stone-700">
							{#each papers as p (p.id)}<option value={p.id}>{p.title} — {p.note}</option>{/each}
						</select>
						{#if paper.meta}
							<p class="font-serif text-base leading-snug">{paper.meta.title}</p>
							<p class="text-xs text-stone-500">{paper.references.length} references · {paper.citations.length} citations · {paper.figures.length} figures/tables · {paper.model?.citationStyle} style · {Math.round(paper.model?.timeMs ?? 0)} ms</p>
						{:else}
							<p class="text-stone-500">Analysing… {Math.round(paper.progress * 100)}%</p>
						{/if}
						<div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-stone-500">
							<span>Groups</span>
							<ToggleGroup label="Citation group layout" bind:value={layout} items={[{ value: 'auto', label: 'Auto' }, { value: 'list', label: 'List all' }, { value: 'pager', label: 'One by one' }]} />
							<span>On click</span>
							<ToggleGroup label="Reference click action" bind:value={clickAction} items={[{ value: 'jump', label: 'Jump' }, { value: 'arxiv', label: 'arXiv' }, { value: 'reader', label: 'Open in reader' }]} />
							<span>Card</span>
							<ToggleGroup label="Card design" bind:value={design} items={[{ value: 'default', label: 'Default' }, { value: 'custom', label: 'Custom + transition' }]} />
						</div>
					</div>
					<Tabs bind:value={panel} tabs={[{ value: 'references', label: 'References' }, { value: 'figures', label: 'Figures' }]} class="min-h-0 flex-1" listClass="mx-3 mt-3">
						{#snippet content(id)}
							{#if id === 'references'}
								<Paper.References class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
									{#snippet item({ reference, citedCount, go, nextCitation })}
										<div class="rounded-md px-2 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">
											<button class="block w-full text-left" onclick={go}>
												<span class="mr-1 font-mono text-xs text-stone-500">{reference.label}</span>
												<span class="font-medium">{reference.parsed.title ?? reference.raw.slice(0, 120)}</span>
												<span class="block text-xs text-stone-500">{reference.parsed.authors.slice(0, 3).join(', ')}{reference.parsed.year ? ` · ${reference.parsed.year}` : ''}</span>
											</button>
											{#if citedCount}<button class="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline" onclick={nextCitation}>cited {citedCount}× — next <span class="{icons.down} size-3"></span></button>{/if}
										</div>
									{/snippet}
								</Paper.References>
							{:else}
								<Paper.Figures thumbnailWidth={340} class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [&_[data-part=open]]:block [&_[data-part=open]]:w-full [&_[data-part=open]]:text-left [&_[data-part=label]]:mt-1 [&_[data-part=label]]:block [&_[data-part=label]]:font-medium [&_[data-part=caption]]:line-clamp-2 [&_[data-part=caption]]:text-xs [&_[data-part=caption]]:text-stone-500 [&_[data-part=thumbnail]]:min-h-16 [&_[data-part=thumbnail]]:overflow-hidden [&_[data-part=thumbnail]]:rounded [&_[data-part=thumbnail]]:border [&_[data-part=thumbnail]]:border-stone-200 [&_[data-part=thumbnail]]:bg-white" />
							{/if}
						{/snippet}
					</Tabs>
				</aside>

				{#if design === 'default'}
					<!-- The default card, with app actions and a click override. -->
					<Paper.CitationCard {layout} {onReferenceClick}>
						{#snippet actions({ reference })}
							{#if reference.parsed.arxivId}
								<button type="button" class={chipBtn} onclick={() => goto(`${resolve('/demo/[slug]', { slug: 'reader' })}?paper=${reference.parsed.arxivId}`)}><span class="{icons.book} size-3"></span>Open in reader</button>
							{/if}
							<button type="button" class={chipBtn} onclick={() => importRef(reference)}><span class="{icons.import} size-3"></span>Import</button>
						{/snippet}
					</Paper.CitationCard>
				{:else}
					<!-- Fully custom card: forceMount keeps it mounted so Svelte transitions can run on exit. -->
					<Paper.CitationCard {layout} forceMount placement="bottom" {onReferenceClick}>
						{#snippet child({ props, open, references, go })}
							{#if open}
								<div {...props} in:fly={{ y: -8, duration: 160 }} out:scale={{ start: 0.97, duration: 110 }} class="w-[26rem] overflow-hidden rounded-2xl border border-stone-200 bg-white/95 text-sm shadow-2xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
									<div class="flex items-center gap-2 bg-stone-900 px-4 py-2 text-xs text-white dark:bg-stone-100 dark:text-stone-900">
										<span class="{icons.book} size-3.5"></span>{references.length} reference{references.length > 1 ? 's' : ''}
									</div>
									<ul class="max-h-80 divide-y divide-stone-100 overflow-y-auto dark:divide-stone-800">
										{#each references as r (r.id)}
											{@const meta = paper.metadata.get(r.id)}
											{@const data = meta?.status === 'done' ? meta.data : null}
											<li class="p-3">
												<button type="button" class="text-left font-serif text-[15px] leading-snug hover:underline" onclick={() => go(r)}>{data?.title ?? r.parsed.title ?? r.raw}</button>
												<p class="mt-0.5 text-xs text-stone-500">{(data?.authors ?? r.parsed.authors).slice(0, 3).join(', ')} · {data?.year ?? r.parsed.year ?? '—'}{#if data?.citationCount != null} · {data.citationCount.toLocaleString()} citations{/if}</p>
												<div class="mt-1.5 flex gap-1.5">
													<button type="button" class={chipBtn} onclick={() => importRef(r)}><span class="{icons.import} size-3"></span>Import</button>
													{#if r.parsed.arxivId}<a class={chipBtn} href="https://arxiv.org/abs/{r.parsed.arxivId}" target="_blank" rel="noopener noreferrer"><span class="{icons.external} size-3"></span>arXiv</a>{/if}
												</div>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						{/snippet}
					</Paper.CitationCard>
				{/if}
				<!-- Figure / table / section previews with an enter + exit transition. -->
				<Paper.CrossRefPreview forceMount>
					{#snippet child({ props, open, label, canvasProps })}
						{#if open}
							<div {...props} transition:scale={{ start: 0.96, duration: 130 }} class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
								<div {...(canvasProps as Record<string, never>)}></div>
								<p class="border-t border-stone-100 px-3 py-1.5 text-xs text-stone-500 dark:border-stone-800">{label}</p>
							</div>
						{/if}
					{/snippet}
				</Paper.CrossRefPreview>
			{/snippet}
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
