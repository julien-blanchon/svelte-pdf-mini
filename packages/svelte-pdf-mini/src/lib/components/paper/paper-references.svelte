<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PaperContext } from '../../state/context.js';
	import type { Reference } from '../../core/paper/types.js';
	import type { PaperReferencesProps, ReferenceItemSnippetProps } from './types.js';

	let { item, ref = $bindable(null), child, children, ...rest }: PaperReferencesProps = $props();
	const paper = PaperContext.get();
	/** Per reference: index of the citation `nextCitation` last jumped to. */
	const cursor = new Map<string, number>();
	const itemPropsFor = (r: Reference): ReferenceItemSnippetProps => {
		const cites = paper.citationsByReference.get(r.id) ?? [];
		return {
			reference: r,
			citedCount: cites.length,
			metadata: paper.metadata.get(r.id),
			go: () => paper.goToReference(r),
			nextCitation: () => {
				if (!cites.length) return;
				const i = ((cursor.get(r.id) ?? -1) + 1) % cites.length;
				cursor.set(r.id, i);
				paper.goToCitation(cites[i]);
			}
		};
	};
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, { 'data-pdf-references': '', role: 'list', ...refAttachment })
	);
</script>

{#if child}
	{@render child({ props: mergedProps, references: paper.references })}
{:else}
	<div {...mergedProps}>
		{#if children}
			{@render children({ references: paper.references })}
		{:else}
			{#each paper.references as r (r.id)}
				{@const p = itemPropsFor(r)}
				<div role="listitem" data-pdf-reference="" data-cited={p.citedCount}>
					{#if item}
						{@render item(p)}
					{:else}
						<button type="button" data-part="open" onclick={p.go}>
							<span data-part="label">{r.label}</span>
							<span data-part="title">{r.parsed.title ?? r.raw}</span>
						</button>
						{#if p.citedCount}<button type="button" data-part="cited" onclick={p.nextCitation}
								>cited {p.citedCount}×</button
							>{/if}
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/if}
