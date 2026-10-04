<script module lang="ts">
	export const meta = {
		title: 'Find',
		description: 'Search ignoring case, accents, ligatures and line-break hyphens. Choose how matches are drawn (all, current only, or others styled differently through the match snippet), browse results grouped by section, and see every hit on a minimap scrollbar. Enter / Shift+Enter, Ctrl/⌘ + F.',
		order: 6,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Find, Minimap, Paper, Viewer, sectionAt, type FindMatch, type PaperState } from 'svelte-pdf-mini';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let query = $state('attention');
	let style = $state<'all' | 'current' | 'underline'>('all');
	let paper = $state<PaperState>();
	const toggle = 'rounded px-1.5 py-0.5 font-mono text-xs text-stone-500 data-[active]:bg-stone-900 data-[active]:text-white dark:data-[active]:bg-stone-100 dark:data-[active]:text-stone-900';

	/** Group matches by the section they fall in (falls back to the page). */
	function groups(matches: FindMatch[]) {
		const out: { key: string; title: string; matches: FindMatch[] }[] = [];
		for (const m of matches) {
			const s = paper?.sections.length && m.rect ? sectionAt(paper.sections, m.page, m.rect[3]) : null;
			const key = s?.id ?? `p${m.page}`;
			const title = s ? [s.number, s.title].filter(Boolean).join(' ') : `Page ${m.page}`;
			const last = out.at(-1);
			if (last?.key === key) last.matches.push(m);
			else out.push({ key, title, matches: [m] });
		}
		return out;
	}
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="flex h-full">
		<Paper.Root bind:paper>
			<Find.Root bind:query>
				{#snippet children({ find })}
					<aside class="flex w-80 shrink-0 flex-col border-r border-stone-200 dark:border-stone-800">
						<div class="space-y-2 border-b border-stone-200 p-3 dark:border-stone-800">
							<div class="flex items-center gap-1 rounded-md border border-stone-300 px-2 focus-within:ring-2 focus-within:ring-blue-500 dark:border-stone-700">
								<span class="{icons.search} size-4 text-stone-400"></span>
								<Find.Input class="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" placeholder="Find in paper…" />
								<Find.Count class="text-xs whitespace-nowrap text-stone-500 tabular-nums" />
								<Find.Prev class="grid size-6 place-items-center disabled:opacity-30"><span class="{icons.up} size-4"></span></Find.Prev>
								<Find.Next class="grid size-6 place-items-center disabled:opacity-30"><span class="{icons.down} size-4"></span></Find.Next>
							</div>
							<div class="flex items-center gap-1">
								<Find.Toggle option="caseSensitive" class={toggle} />
								<Find.Toggle option="wholeWord" class={toggle} />
								<Find.Toggle option="diacritics" class={toggle} />
								<Find.Toggle option="regex" class={toggle} />
								{#if find.status === 'searching'}<span class="ml-auto text-xs text-stone-500">page {find.searchedPages}/{find.viewer.document.numPages}</span>{/if}
							</div>
							<div class="flex items-center justify-between text-xs text-stone-500">
								Draw
								<ToggleGroup label="How matches are drawn" bind:value={style} items={[{ value: 'all', label: 'All' }, { value: 'current', label: 'Current only' }, { value: 'underline', label: 'Others underlined' }]} />
							</div>
						</div>
						<div class="min-h-0 flex-1 overflow-y-auto p-1 text-sm">
							{#each groups(find.matches) as g (g.key)}
								<p class="sticky top-0 z-10 bg-white/95 px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase backdrop-blur dark:bg-stone-950/95">{g.title} <span class="font-normal">· {g.matches.length}</span></p>
								{#each g.matches as match (match.index)}
									<Find.Result {match} class="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 data-[active]:bg-amber-100 dark:hover:bg-stone-800 dark:data-[active]:bg-amber-900/40 [&_mark]:rounded-sm [&_mark]:bg-amber-300/70 [&_mark]:px-0.5 [&_[data-part=page]]:mr-2 [&_[data-part=page]]:text-xs [&_[data-part=page]]:text-stone-500" />
								{/each}
							{/each}
						</div>
					</aside>
					<Viewer.Viewport class="min-w-0 flex-1 bg-stone-100 dark:bg-stone-900">
						<Viewer.Pages>
							{#snippet children({ pageNumber })}
								<Viewer.Page {pageNumber}>
									<Viewer.Canvas />
									<Viewer.TextLayer />
									{#if style === 'underline'}
										<!-- Custom drawing: the current match is a filled box, the others a thin underline. -->
										<Find.Layer>
											{#snippet match({ current, points })}
												{#each points as pts, i (i)}
													{#if current}
														<polygon points={pts} fill="rgb(234 88 12 / 0.45)" stroke="rgb(234 88 12)" stroke-width="0.6" />
													{:else}
														{@const [, , c, d] = pts.split(' ').map((p) => p.split(',').map(Number))}
														<line x1={d[0]} y1={d[1] + 0.5} x2={c[0]} y2={c[1] + 0.5} stroke="rgb(245 158 11)" stroke-width="1.2" />
													{/if}
												{/each}
											{/snippet}
										</Find.Layer>
									{:else}
										<Find.Layer show={style} />
									{/if}
								</Viewer.Page>
							{/snippet}
						</Viewer.Pages>
					</Viewer.Viewport>
					<!-- Minimap scrollbar with a marker per match (current one stronger). -->
					<Minimap.Root width={64} class="h-full shrink-0 border-l border-stone-200 dark:border-stone-800">
						<Minimap.Viewport />
						<Minimap.Markers find sections />
					</Minimap.Root>
				{/snippet}
			</Find.Root>
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
