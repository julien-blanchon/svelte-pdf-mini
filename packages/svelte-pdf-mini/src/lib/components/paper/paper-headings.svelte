<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Section } from '../../core/paper/types.js';
	import { clamp, pdfRectToPercent } from '../../core/view/geometry.js';
	import { PageContext, PaperContext } from '../../state/context.js';
	import type { PaperHeadingsProps } from './types.js';

	let {
		idPrefix = 'section-',
		baseLevel = 2,
		visible = false,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: PaperHeadingsProps = $props();
	const paper = PaperContext.get();
	const page = PageContext.get();
	const sections = $derived(paper.flatSections.filter((s) => s.page === page.pageNumber));

	/**
	 * Top of PDF y `y` as a percentage of the page. Headings must exist for every page
	 * (DOM tables of contents scan them all), so fall back to the page size until the
	 * page's viewport is loaded (it only loads near the view).
	 */
	const topPercent = (y: number) => {
		const vp = page.viewport;
		if (vp) return pdfRectToPercent(vp, [0, y, 1, y]).top;
		const h = paper.viewer.document.pageSize(page.pageNumber).height || 1;
		return clamp((1 - y / h) * 100, 0, 100);
	};
	const headingTag = (s: Section) => `h${Math.min(6, baseLevel + s.level - 1)}`;
	const headingText = (s: Section) => (s.number ? `${s.number} ${s.title}` : s.title);

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, { 'data-pdf-headings': '', ...refAttachment }));
</script>

<!--
	Real headings (h2–h6) at each section's position: screen readers get the
	document structure, and DOM-based tables of contents (e.g. melt-ui's
	createTableOfContents) can observe them.
-->
<div {...mergedProps}>
	{#each sections as s (s.id)}
		<svelte:element
			this={headingTag(s)}
			id="{idPrefix}{s.id}"
			data-pdf-heading=""
			data-section={s.id}
			data-level={s.level}
			data-visible={visible ? '' : undefined}
			style:--pdf-heading-top="{topPercent(s.y)}%">{headingText(s)}</svelte:element
		>
	{/each}
</div>

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-headings])) {
			position: absolute;
			inset: 0;
			pointer-events: none;
		}
		/*
		 * The headings are always rendered here (no `child`), so these rules are scoped:
		 * they must win over app-wide heading styles (margins) to stay visually hidden.
		 */
		[data-pdf-heading] {
			position: absolute;
			left: 0;
			top: var(--pdf-heading-top);
		}
		[data-pdf-heading][data-visible] {
			margin: 0;
		}
		/* Visually hidden, still read by assistive tech. */
		[data-pdf-heading]:not([data-visible]) {
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border-width: 0;
			transform: translateX(-100%);
		}
	}
</style>
