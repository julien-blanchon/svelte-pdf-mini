<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PaperContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { itemProps, sectionTitle, sectionsUpTo } from './shared.js';
	import type { TocRailProps } from './types.js';

	let {
		maxDepth = 2,
		item,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: TocRailProps = $props();
	const paper = PaperContext.get();
	const list = $derived(sectionsUpTo(paper, maxDepth));
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-toc': 'rail',
			role: 'navigation',
			'aria-label': paper.viewer.t('sections'),
			style: { '--pdf-reading-progress': paper.readingProgress },
			...refAttachment
		})
	);
</script>

<div {...mergedProps}>
	<div data-part="progress"></div>
	{#each list as s (s.id)}
		{@const p = itemProps(paper, s, s.level)}
		{#if item}{@render item(p)}{:else}
			<button
				type="button"
				data-pdf-toc-dot=""
				data-depth={s.level}
				data-active={dataAttr(p.active)}
				data-in-path={dataAttr(p.inPath)}
				aria-label={sectionTitle(s)}
				aria-current={p.active ? 'location' : undefined}
				style:--pdf-toc-position={p.position}
				onclick={p.go}
			>
				<span data-part="label">{sectionTitle(s)}</span>
			</button>
		{/if}
	{/each}
</div>

<style>
	:global(:where([data-pdf-toc='rail'])) {
		position: relative;
	}
	:global(:where([data-pdf-toc='rail'] > [data-part='progress'])) {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: calc(var(--pdf-reading-progress, 0) * 100%);
		pointer-events: none;
	}
	/* Not zero-specificity: must beat the theme's `[data-pdf-toc-dot] { all: unset }`. */
	:global([data-pdf-toc='rail'] > [data-pdf-toc-dot]) {
		position: absolute;
		top: calc(var(--pdf-toc-position) * 100%);
		transform: translateY(-50%);
	}
</style>
