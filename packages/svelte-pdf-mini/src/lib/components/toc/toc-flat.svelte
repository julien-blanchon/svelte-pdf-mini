<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PaperContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { itemProps, sectionTitle, sectionsUpTo } from './shared.js';
	import type { TocFlatProps } from './types.js';

	let {
		maxDepth = 1,
		item,
		empty,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: TocFlatProps = $props();
	const paper = PaperContext.get();
	const list = $derived(sectionsUpTo(paper, maxDepth));
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-toc': 'flat',
			role: 'navigation',
			'aria-label': paper.viewer.t('sections'),
			...refAttachment
		})
	);
</script>

<div {...mergedProps}>
	{#if list.length}
		<ol data-pdf-toc-group="">
			{#each list as s (s.id)}
				{@const p = itemProps(paper, s, s.level)}
				<li>
					{#if item}{@render item(p)}{:else}
						<!-- Deeper levels may be hidden, so a section holding the active one counts as active. -->
						<button
							type="button"
							data-pdf-toc-item=""
							data-depth={s.level}
							data-active={dataAttr(p.inPath)}
							data-in-path={dataAttr(p.inPath)}
							aria-current={p.active ? 'location' : undefined}
							onclick={p.go}
						>
							<span data-part="title">{sectionTitle(s)}</span>
							<span data-part="page">{paper.viewer.document.pageLabel(s.page)}</span>
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		{@render empty?.({ status: paper.status })}
	{/if}
</div>

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-toc-group])) {
			list-style: none;
			margin: 0;
			padding: 0;
		}
	}
</style>
