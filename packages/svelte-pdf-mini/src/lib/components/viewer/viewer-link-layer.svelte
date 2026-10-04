<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { classifyDest } from '../../core/document/links.js';
	import type { LinkKind } from '../../core/paper/types.js';
	import type { PdfRect } from '../../core/types.js';
	import { pdfRectToPercent } from '../../core/view/geometry.js';
	import { createTimeout, isHovered } from '../../internal/hover.js';
	import { PageContext } from '../../state/context.js';
	import type { ViewerLinkLayerProps } from './types.js';

	let {
		external = 'new-tab',
		onLinkClick,
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: ViewerLinkLayerProps = $props();
	const page = PageContext.get();
	const viewer = page.viewer;

	interface Link {
		rect: PdfRect;
		dest?: string | unknown[];
		url?: string;
		kind: LinkKind;
	}
	let links = $state.raw<Link[]>([]);

	// Load the page's link annotations.
	$effect(() => {
		const p = page.pdfPage;
		if (!p) return;
		let alive = true;
		p.getAnnotations({ intent: 'display' }).then((annots) => {
			if (!alive) return;
			links = annots
				.filter((a) => a.subtype === 'Link' && (a.dest || a.url))
				.map((a) => ({
					rect: a.rect as PdfRect,
					dest: a.dest ?? undefined,
					url: a.url ?? undefined,
					kind: a.url ? 'url' : classifyDest(a.dest)
				}));
		});
		return () => {
			alive = false;
		};
	});

	// Hover intent: show the preview after a short delay; keep it while the pointer is on it.
	const hover = createTimeout();
	$effect(() => hover.clear);
	const onEnter = (link: Link, anchor: HTMLElement) =>
		hover.set(
			() =>
				(viewer.hoveredLink = { page: page.pageNumber, dest: link.dest, url: link.url, anchor }),
			250
		);
	const onLeave = () =>
		hover.set(() => {
			if (!isHovered('[data-pdf-link-preview]')) viewer.hoveredLink = null;
		}, 200);

	const onClick = (link: Link, e: MouseEvent) => {
		const { kind, rect, dest, url } = link;
		if (onLinkClick?.({ rect, dest, url, kind, page: page.pageNumber }, e) === false) {
			e.preventDefault();
			return;
		}
		if (!dest) return;
		e.preventDefault();
		viewer.hoveredLink = null;
		viewer.navigate({ dest }, { highlight: kind === 'citation' ? 'pulse' : false });
	};

	/** Accessible name: the URL, the named destination, or a generic label. */
	const linkLabel = (link: Link) =>
		link.url ?? (typeof link.dest === 'string' ? link.dest : 'Internal link');

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, { 'data-pdf-link-layer': '', ...refAttachment }));
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else if page.viewport && links.length}
	{@const vp = page.viewport}
	<div {...mergedProps}>
		{#each links as link, i (i)}
			{@const box = pdfRectToPercent(vp, link.rect)}
			<a
				data-pdf-link=""
				data-kind={link.kind}
				{@attach (el) => {
					viewer.linkElements.set(el, { url: link.url, dest: link.dest, kind: link.kind });
				}}
				href={link.url ?? '#'}
				target={link.url && external === 'new-tab' ? '_blank' : undefined}
				rel={link.url ? 'noopener noreferrer' : undefined}
				aria-label={linkLabel(link)}
				style:--pdf-hotspot-left="{box.left}%"
				style:--pdf-hotspot-top="{box.top}%"
				style:--pdf-hotspot-width="{box.width}%"
				style:--pdf-hotspot-height="{box.height}%"
				onclick={(e) => onClick(link, e)}
				onpointerenter={(e) => onEnter(link, e.currentTarget)}
				onpointerleave={onLeave}
			></a>
		{/each}
	</div>
{/if}

<style>
	:global(:where([data-pdf-link-layer])) {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 3;
	}
	:global(:where([data-pdf-link])) {
		position: absolute;
		pointer-events: auto;
		left: var(--pdf-hotspot-left);
		top: var(--pdf-hotspot-top);
		width: var(--pdf-hotspot-width);
		height: var(--pdf-hotspot-height);
	}
</style>
