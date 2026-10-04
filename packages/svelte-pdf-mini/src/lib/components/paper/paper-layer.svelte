<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { CrossRef, InTextCitation, Reference } from '../../core/paper/types.js';
	import { quadsBounds } from '../../core/text/text-index.js';
	import { pdfRectToPercent } from '../../core/view/geometry.js';
	import { createTimeout, isHovered } from '../../internal/hover.js';
	import { PageContext, PaperContext } from '../../state/context.js';
	import type { PaperHover } from '../../state/paper.svelte.js';
	import type { PaperLayerProps } from './types.js';

	let {
		citations = true,
		crossRefs = true,
		onCitationClick,
		onCrossRefClick,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: PaperLayerProps = $props();
	const paper = PaperContext.get();
	const page = PageContext.get();
	const cites = $derived(citations ? (paper.citationsByPage.get(page.pageNumber) ?? []) : []);
	const xrefs = $derived(crossRefs ? (paper.crossRefsByPage.get(page.pageNumber) ?? []) : []);

	// Hover: show right away; on leave, keep it while the pointer is on the card / preview.
	const leaveTimer = createTimeout();
	$effect(() => leaveTimer.clear);
	const enter = (kind: PaperHover['kind'], id: string, anchor: Element) => {
		leaveTimer.clear();
		paper.hovered = { kind, id, anchor };
	};
	const leave = () =>
		leaveTimer.set(() => {
			if (!isHovered('[data-pdf-citation-card]', '[data-pdf-crossref-preview]'))
				paper.hovered = null;
		}, 180);

	const onCitation = (c: InTextCitation, e: MouseEvent) => {
		e.preventDefault();
		const refs = c.referenceIds
			.map((id) => paper.referenceById.get(id))
			.filter((r): r is Reference => !!r);
		paper.hovered = null;
		if (onCitationClick?.(c, refs, e) === false) return;
		if (refs[0]) paper.goToReference(refs[0]);
	};
	const onCrossRef = (x: CrossRef, e: MouseEvent) => {
		e.preventDefault();
		paper.hovered = null;
		if (onCrossRefClick?.(x, e) === false) return;
		paper.goToCrossRef(x);
	};

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, { 'data-pdf-paper-layer': '', ...refAttachment }));
</script>

{#if page.viewport && (cites.length || xrefs.length)}
	{@const vp = page.viewport}
	<div {...mergedProps}>
		{#each cites as c (c.id)}
			<!-- One hotspot per line of the citation (multi-line groups). -->
			{#each c.quads as q, i (i)}
				{@const box = pdfRectToPercent(vp, quadsBounds([q])!)}
				<a
					href="#{c.id}"
					data-pdf-citation=""
					data-hovered={paper.hovered?.id === c.id ? '' : undefined}
					aria-label={paper.viewer.t('citation', { text: c.text })}
					style:--pdf-hotspot-left="{box.left}%"
					style:--pdf-hotspot-top="{box.top}%"
					style:--pdf-hotspot-width="{box.width}%"
					style:--pdf-hotspot-height="{box.height}%"
					onpointerenter={(e) => enter('citation', c.id, e.currentTarget)}
					onpointerleave={leave}
					onclick={(e) => onCitation(c, e)}
				></a>
			{/each}
		{/each}
		{#each xrefs as x (x.id)}
			{@const box = pdfRectToPercent(vp, x.rect)}
			<a
				href="#{x.id}"
				data-pdf-crossref=""
				data-kind={x.kind}
				aria-label={x.text}
				style:--pdf-hotspot-left="{box.left}%"
				style:--pdf-hotspot-top="{box.top}%"
				style:--pdf-hotspot-width="{box.width}%"
				style:--pdf-hotspot-height="{box.height}%"
				onpointerenter={(e) => enter('crossref', x.id, e.currentTarget)}
				onpointerleave={leave}
				onclick={(e) => onCrossRef(x, e)}
			></a>
		{/each}
	</div>
{/if}

<style>
	:global(:where([data-pdf-paper-layer])) {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 4;
	}
	:global(:where([data-pdf-citation], [data-pdf-crossref])) {
		position: absolute;
		pointer-events: auto;
		left: var(--pdf-hotspot-left);
		top: var(--pdf-hotspot-top);
		width: var(--pdf-hotspot-width);
		height: var(--pdf-hotspot-height);
	}
</style>
