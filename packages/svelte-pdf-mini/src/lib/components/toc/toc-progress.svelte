<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PaperContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { itemProps, sectionTitle, topLevelSegments } from './shared.js';
	import type { TocProgressProps } from './types.js';

	let { item, ref = $bindable(null), child, children, ...rest }: TocProgressProps = $props();
	const paper = PaperContext.get();
	const progress = $derived(paper.readingProgress);
	const segments = $derived(topLevelSegments(paper));
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-toc': 'progress',
			role: 'progressbar',
			'aria-label': paper.viewer.t('readingProgress'),
			'aria-valuemin': 0,
			'aria-valuemax': 100,
			'aria-valuenow': Math.round(progress * 100),
			style: { '--pdf-reading-progress': progress },
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, progress })}
{:else}
	<div {...mergedProps}>
		<div data-part="fill"></div>
		{#each segments as { section, start, end } (section.id)}
			{@const p = { ...itemProps(paper, section, 1), start, end }}
			{#if item}{@render item(p)}{:else}
				<button
					type="button"
					data-pdf-toc-segment=""
					data-active={dataAttr(p.inPath)}
					title={sectionTitle(section)}
					aria-label={sectionTitle(section)}
					style:--pdf-toc-start={start}
					style:--pdf-toc-end={end}
					onclick={p.go}
				></button>
			{/if}
		{/each}
		{@render children?.({ progress })}
	</div>
{/if}

<style>
	:global(:where([data-pdf-toc='progress'])) {
		position: relative;
	}
	:global(:where([data-pdf-toc='progress'] > [data-part='fill'])) {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: calc(var(--pdf-reading-progress, 0) * 100%);
		pointer-events: none;
	}
	/* Not zero-specificity: must beat the theme's `[data-pdf-toc-segment] { all: unset }`. */
	:global([data-pdf-toc='progress'] > [data-pdf-toc-segment]) {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(var(--pdf-toc-start) * 100%);
		width: calc((var(--pdf-toc-end) - var(--pdf-toc-start)) * 100%);
	}
</style>
