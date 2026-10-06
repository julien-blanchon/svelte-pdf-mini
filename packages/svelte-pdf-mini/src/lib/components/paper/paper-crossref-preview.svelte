<script lang="ts">
	import { watch } from 'runed';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey } from 'svelte/attachments';
	import { renderRegionToCanvas } from '../../core/document/render.js';
	import type { CrossRef, ResolvedTarget } from '../../core/paper/types.js';
	import type { PdfRect } from '../../core/types.js';
	import { float } from '../../internal/floating.js';
	import { bandBelow, inflateRect, topOfPoint } from '../../internal/preview-region.js';
	import { cssVars } from '../../internal/style.js';
	import { PaperContext } from '../../state/context.js';
	import { PaperHoverIntent } from './hover-intent.svelte.js';
	import type { PaperCrossRefPreviewProps } from './types.js';

	let {
		width = 440,
		delay = 250,
		placement = 'top',
		forceMount = false,
		onOpenChange,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: PaperCrossRefPreviewProps = $props();
	const paper = PaperContext.get();
	let el: HTMLElement | null = $state(null);
	let canvasHost: HTMLElement | null = $state(null);

	const hover = new PaperHoverIntent(paper, 'crossref', { delay: () => delay });
	const open = $derived(hover.open);
	// Changes only (not the initial state), untracked: the callback's reads don't re-run it.
	watch(
		() => open,
		(o) => onOpenChange?.(o),
		{ lazy: true }
	);

	const xref = $derived.by(() => {
		const current = hover.current;
		return current ? (paper.crossRefs.find((x) => x.id === current.id) ?? null) : null;
	});
	const figure = $derived(xref?.targetId ? paper.figureById.get(xref.targetId) : undefined);
	const label = $derived(figure?.label ?? xref?.text ?? '');

	/** Region shown for a target: its box (with a margin), else a band below its point. */
	function regionOf(view: PdfRect, target: ResolvedTarget, kind: CrossRef['kind']): PdfRect {
		if (target.rect) return inflateRect(target.rect, 6);
		return bandBelow(view, topOfPoint(target.point, view[3]), kind === 'equation' ? 70 : 200);
	}

	// Render the target region.
	$effect(() => {
		const x = xref;
		const host = canvasHost;
		const target = figure ? { page: figure.page, rect: figure.rect } : x?.target;
		if (!x || !target || !host || !open) return;
		// Read before the awaits: a theme change (night mode) re-renders the open preview.
		const theme = paper.viewer.pageTheme;
		const controller = new AbortController();
		(async () => {
			const page = await paper.viewer.document.getPage(target.page);
			const canvas = await renderRegionToCanvas({
				page,
				rect: regionOf(page.view as PdfRect, target, x.kind),
				cssWidth: width,
				signal: controller.signal,
				theme
			});
			if (!controller.signal.aborted) host.replaceChildren(canvas);
		})().catch(() => {});
		return () => controller.abort();
	});
	$effect(() => {
		const anchor = hover.current?.anchor;
		if (!el || !anchor || !open) return;
		return float(anchor, el, placement);
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-crossref-preview': '',
			'data-state': open ? 'open' : 'closed',
			// The app runs its own transitions: no default entry animation.
			'data-force-mount': forceMount ? '' : undefined,
			'data-kind': xref?.kind,
			role: 'tooltip',
			style: cssVars({ '--pdf-preview-width': `${width}px` }),
			onpointerleave: () => (paper.hovered = null),
			...refAttachment
		})
	);
	/** Spread on the element the preview canvas is rendered into. */
	const hostKey = createAttachmentKey();
	// The theme's page color behind the canvas, as under the pages (tint, night).
	const canvasProps = $derived({
		style: `background:${paper.viewer.pageTheme.background ?? '#fff'}`,
		[hostKey]: (node: HTMLElement) => {
			canvasHost = node;
			return () => (canvasHost = null);
		}
	});
</script>

{#if xref && (open || forceMount)}
	{#if child}
		{@render child({ props: mergedProps, label, open, canvasProps })}
	{:else if open}
		<div {...mergedProps}>
			<div data-part="canvas" {...canvasProps}></div>
			{#if children}{@render children({ label, open })}{:else}<span data-part="caption"
					>{#if figure}{paper.viewer.t('figureOnPage', {
							label,
							page: paper.viewer.document.pageLabel(figure.page)
						})}{:else}{label}{/if}</span
				>{/if}
		</div>
	{/if}
{/if}

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-crossref-preview])) {
			position: fixed;
			left: 0;
			top: 0;
			z-index: 50;
			width: var(--pdf-preview-width);
		}
	}
</style>
