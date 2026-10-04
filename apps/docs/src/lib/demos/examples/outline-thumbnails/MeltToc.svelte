<!--
	melt-ui's (legacy, stores) createTableOfContents driving a PDF (used without melt's
	preprocessor: spread the builder's attributes and apply its action, `{...$item(id)} use:item`). Paper.Headings renders real
	h2–h6 elements at each section's position inside the pages, so melt can discover them
	(it watches DOM mutations), track the active one, and call our scrollFn on click.
-->
<script lang="ts">
	import { createTableOfContents, type TableOfContentsItem } from '@melt-ui/svelte';

	let { selector, onSelect }: { selector: string; onSelect: (headingId: string) => void } = $props();

	const {
		elements: { item },
		states: { headingsTree }
	} = createTableOfContents({
		// svelte-ignore state_referenced_locally
		selector,
		exclude: ['h1', 'h5', 'h6'],
		activeType: 'highest',
		// Scroll with the viewer (not window scrolling), and don't touch history (SvelteKit owns it).
		scrollFn: (id) => onSelect(id),
		pushStateFn: () => {}
	});
</script>

{#snippet tree(items: TableOfContentsItem[], depth: number)}
	<ul class="space-y-0.5" style="padding-left:{depth ? 12 : 0}px">
		{#each items as it (it.id)}
			<li>
				<a
					href="#{it.id}"
					{...$item(it.id)}
					use:item
					class="block truncate rounded px-2 py-1 text-stone-700 hover:bg-stone-100 data-[active]:bg-emerald-50 data-[active]:font-medium data-[active]:text-emerald-700 dark:text-stone-300 dark:hover:bg-stone-800 dark:data-[active]:bg-emerald-950 dark:data-[active]:text-emerald-300"
				>{it.title}</a>
				{#if it.children?.length}{@render tree(it.children, depth + 1)}{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#if $headingsTree.length}
	{@render tree($headingsTree, 0)}
{:else}
	<p class="p-2 text-stone-500">Waiting for headings…</p>
{/if}
