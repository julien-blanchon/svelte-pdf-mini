<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PaperContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { itemProps, sectionTitle } from './shared.js';
	import type { TocBreadcrumbProps } from './types.js';

	let {
		separator,
		item,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: TocBreadcrumbProps = $props();
	const paper = PaperContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-toc': 'breadcrumb',
			role: 'navigation',
			'aria-label': paper.viewer.t('currentSection'),
			...refAttachment
		})
	);
</script>

<div {...mergedProps}>
	{#each paper.activePath as s, i (s.id)}
		{@const p = itemProps(paper, s, i + 1)}
		{#if i > 0}
			{#if separator}
				{@render separator()}
			{:else}
				<span data-part="separator" aria-hidden="true">›</span>
			{/if}
		{/if}
		{#if item}
			{@render item(p)}
		{:else}
			<button
				type="button"
				data-pdf-toc-item=""
				data-active={dataAttr(p.active)}
				aria-current={p.active ? 'location' : undefined}
				onclick={p.go}>{sectionTitle(s)}</button
			>
		{/if}
	{/each}
</div>
