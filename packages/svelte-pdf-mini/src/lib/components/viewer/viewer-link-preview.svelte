<script lang="ts">
	import { watch } from 'runed';
	import type { PDFPageProxy } from 'pdfjs-dist';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey } from 'svelte/attachments';
	import {
		resolveDestination,
		type ResolvedDestination
	} from '../../core/document/destinations.js';
	import { classifyDest, previewHeight } from '../../core/document/links.js';
	import type { LinkKind } from '../../core/paper/types.js';
	import type { PdfRect } from '../../core/types.js';
	import { float } from '../../internal/floating.js';
	import { bandBelow, topOfPoint } from '../../internal/preview-region.js';
	import { cssVars } from '../../internal/style.js';
	import { ViewerContext } from '../../state/context.js';
	import type { ViewerLinkPreviewProps } from './types.js';

	let {
		width = 420,
		kinds,
		forceMount = false,
		onOpenChange,
		placement = 'top',
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ViewerLinkPreviewProps = $props();
	const viewer = ViewerContext.get();

	interface Target {
		page: number;
		kind: LinkKind;
		url?: string;
	}

	let el: HTMLElement | null = $state(null);
	let canvasHost: HTMLElement | null = $state(null);
	let target = $state.raw<Target | null>(null);
	/** Last resolved target (kept while closing, so exit transitions keep their content). */
	let lastTarget = $state.raw<Target | null>(null);
	let loading = $state(false);

	const link = $derived(viewer.hoveredLink);
	// Nothing opens while a text selection is being dragged.
	const open = $derived(
		!!link && !!target && !viewer.selection.selecting && (!kinds || kinds.includes(target.kind))
	);
	// Changes only (not the initial state), untracked: the callback's reads don't re-run it.
	watch(
		() => open,
		(o) => onOpenChange?.(o),
		{ lazy: true }
	);

	const setTarget = (t: Target | null) => {
		target = t;
		if (t) lastTarget = t;
	};

	/** Region shown for a destination: its box, else a band below its point (or the page top). */
	function regionOf(page: PDFPageProxy, dest: ResolvedDestination, kind: LinkKind): PdfRect {
		const view = page.view as PdfRect;
		const right = view[0] + page.getViewport({ scale: 1 }).width;
		if (dest.rect) return bandBelow(view, dest.rect[3], dest.rect[3] - dest.rect[1], right);
		return bandBelow(view, topOfPoint(dest.point, view[3]), previewHeight(kind), right);
	}

	// Resolve the hovered link and render its target region.
	$effect(() => {
		const l = link;
		const doc = viewer.document.proxy;
		if (!l || !doc || l.url) {
			loading = false;
			setTarget(l?.url ? { page: 0, kind: 'url', url: l.url } : null);
			return;
		}
		// Read before the awaits: a theme change (night mode) re-renders the open preview.
		const theme = viewer.pageTheme;
		const controller = new AbortController();
		const { signal } = controller;
		const kind = classifyDest(l.dest);
		loading = true;
		(async () => {
			const dest = await resolveDestination(doc, l.dest);
			if (!dest || signal.aborted) return;
			setTarget({ page: dest.page, kind });
			const page = await viewer.document.getPage(dest.page);
			const rect = regionOf(page, dest, kind);
			const canvas = await viewer.document.renderRegion(dest.page, rect, width, { signal, theme });
			if (!signal.aborted) canvasHost?.replaceChildren(canvas);
		})()
			.catch(() => {})
			.finally(() => {
				if (!signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	// Position next to the hovered link.
	$effect(() => {
		const anchor = link?.anchor;
		if (!anchor || !el || !open) return;
		return float(anchor, el, placement);
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	// The preview floats over the page: a wheel over it scrolls the document
	// (and closes it), instead of scrolling whatever is behind it.
	const wheelAttachment = {
		[createAttachmentKey()]: (node: HTMLElement) => {
			const onWheel = (e: WheelEvent) => {
				if (e.ctrlKey || e.metaKey) return;
				e.preventDefault();
				viewer.hoveredLink = null;
				viewer.scrollEl?.scrollBy({ left: e.deltaX, top: e.deltaY });
			};
			node.addEventListener('wheel', onWheel, { passive: false });
			return () => node.removeEventListener('wheel', onWheel);
		}
	};
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-link-preview': '',
			'data-state': open ? 'open' : 'closed',
			// The app runs its own transitions: no default entry animation.
			'data-force-mount': forceMount ? '' : undefined,
			'data-kind': target?.kind,
			'data-loading': loading ? '' : undefined,
			role: 'tooltip',
			style: cssVars({ '--pdf-preview-width': `${width}px` }),
			onpointerleave: () => (viewer.hoveredLink = null),
			...refAttachment,
			...wheelAttachment
		})
	);
	const hostKey = createAttachmentKey();
	// The theme's page color behind the canvas, as under the pages (tint, night).
	const canvasProps = $derived({
		style: `background:${viewer.pageTheme.background ?? '#fff'}`,
		'data-pdf-link-preview-canvas': '',
		[hostKey]: (node: HTMLElement) => {
			canvasHost = node;
			return () => (canvasHost = null);
		}
	});
</script>

{#if (open && target) || (forceMount && lastTarget)}
	{@const t = (target ?? lastTarget)!}
	{#if child}
		{@render child({
			props: mergedProps,
			open,
			kind: t.kind,
			page: t.page,
			url: t.url,
			canvasProps
		})}
	{:else if open && target}
		<div {...mergedProps}>
			{#if target.kind === 'url'}
				<span data-part="url">{target.url}</span>
			{:else}
				<div {...canvasProps}></div>
				{#if children}{@render children({ open, kind: target.kind, page: target.page })}{:else}<span
						data-part="caption"
						>{viewer.t('linkPreviewCaption', {
							page: viewer.document.pageLabel(target.page),
							kind: viewer.t(`linkKind_${target.kind}`)
						})}</span
					>{/if}
			{/if}
		</div>
	{/if}
{/if}

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-link-preview])) {
			position: fixed;
			left: 0;
			top: 0;
			z-index: 50;
			width: var(--pdf-preview-width);
		}
	}
</style>
