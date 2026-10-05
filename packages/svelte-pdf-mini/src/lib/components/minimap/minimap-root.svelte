<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey, type Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import type { PdfRect } from '../../core/types.js';
	import { drawTextDensity } from '../../core/view/minimap-draw.js';
	import { cssVars } from '../../internal/style.js';
	import { dataAttr } from '../../internal/types.js';
	import { MinimapContext, PaperContext, ViewerContext } from '../../state/context.js';
	import { MinimapState } from '../../state/minimap.svelte.js';
	import { thumbnailCache } from '../../state/thumbnails.svelte.js';
	import { MinimapDragContext } from './drag-context.js';
	import type { MinimapRootProps } from './types.js';

	let {
		width = 80,
		mode = 'scroll',
		gap = 4,
		variant = 'pages',
		pages = true,
		wheel = 'document',
		minPreviewHeight = 36,
		minimap = $bindable(),
		ref = $bindable(null),
		child,
		children,
		...rest
	}: MinimapRootProps = $props();
	const viewer = ViewerContext.get();
	const paper = PaperContext.getOr(null);
	const mm = MinimapContext.set(
		new MinimapState({
			viewer,
			width: () => width,
			mode: () => mode,
			gap: () => gap,
			wheel: () => wheel,
			minPreviewHeight: () => minPreviewHeight
		})
	);
	minimap = mm;
	const cache = thumbnailCache(viewer.document);

	// Only pages inside the visible strip window get drawn.
	const shown = $derived(
		mm.pages.filter(
			(p) => p.top + p.height >= mm.offset - 50 && p.top <= mm.offset + mm.height + 50
		)
	);

	/** What each page box shows: a bitmap, the text structure, a plain block, or nothing. */
	type PreviewKind = 'none' | 'blocks' | 'pages' | 'text';
	const pageKind: PreviewKind = $derived.by(() => {
		if (!pages || variant === 'spine' || variant === 'heatmap') return 'none';
		// Bitmaps too small to read fall back to blocks.
		if (variant === 'pages' && !mm.previewsUseful) return 'blocks';
		return variant;
	});

	/** Page bitmap from the shared thumbnail cache. */
	const bitmap =
		(page: number): Attachment<HTMLElement> =>
		(node) => {
			let alive = true;
			cache.canvas(page, Math.max(40, mm.width), 8).then(
				(canvas) => alive && node.replaceChildren(canvas),
				() => {}
			);
			return () => (alive = false);
		};

	/** Page structure (text lines, headings, figures) drawn from the text index. */
	const structure =
		(page: number): Attachment<HTMLCanvasElement> =>
		(node) => {
			let alive = true;
			const doc = viewer.document;
			// Read before any await, so figures found later redraw the page.
			const figures = paper?.figures.filter((f) => f.page === page).map((f) => f.rect) ?? [];
			const draw = async () => {
				const [text, pdfPage] = await Promise.all([doc.getPageText(page), doc.getPage(page)]);
				if (!alive) return;
				const dpr = devicePixelRatio || 1;
				node.width = Math.round(node.clientWidth * dpr);
				node.height = Math.round(node.clientHeight * dpr);
				const ctx = node.getContext('2d');
				if (!ctx) return;
				drawTextDensity(ctx, text, {
					width: node.width,
					height: node.height,
					view: pdfPage.view as PdfRect,
					figures
				});
			};
			draw().catch(() => {});
			return () => (alive = false);
		};

	interface Band {
		key: string;
		top: number;
		height: number;
		label: string;
		/** Alternates 0 / 1 (data-index) for striping. */
		index: number;
		/** Set on per-page bands (no Paper.Root). */
		page?: number;
	}
	// Spine: one band per top-level section (needs Paper.Root), else per page.
	const bands = $derived.by((): Band[] => {
		const tops = paper?.sections ?? [];
		if (!tops.length)
			return mm.pages.map((p, i) => ({
				key: `p${p.page}`,
				top: p.top,
				height: p.height,
				label: String(p.page),
				index: i % 2,
				page: p.page
			}));
		return tops.map((s, i) => {
			const top = mm.yOfPoint(s.page, s.y);
			const next = tops[i + 1];
			const bottom = next ? mm.yOfPoint(next.page, next.y) : mm.total;
			return {
				key: s.id,
				top,
				height: Math.max(2, bottom - top),
				label: s.number ? `${s.number} ${s.title}` : s.title,
				index: i % 2
			};
		});
	});
	/** A page band is active on its page, a section band while reading in it. */
	const isActive = (b: Band) =>
		b.page != null ? viewer.page === b.page : !!paper?.activePath.some((s) => s.id === b.key);

	// Pointer: click jumps (center there), dragging scrubs; grabbing the indicator keeps the grab offset.
	type StripPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLElement };
	let dragging = $state(false);
	MinimapDragContext.set({
		get dragging() {
			return dragging;
		}
	});
	let grab = 0;
	/** Strip y (before offset) under the pointer. */
	const stripY = (e: StripPointerEvent) =>
		e.clientY - e.currentTarget.getBoundingClientRect().top + mm.offset;
	function onDown(e: StripPointerEvent) {
		if (e.button !== 0) return;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// The pointer is already gone (e.g. a synthetic event).
		}
		const y = stripY(e);
		const ind = mm.indicator;
		const onIndicator = y >= ind.top && y <= ind.top + ind.height;
		grab = onIndicator ? y - (ind.top + ind.height / 2) : 0;
		dragging = true;
		mm.scrollTo(y - grab, onIndicator ? 'instant' : 'smooth');
	}
	function onMove(e: StripPointerEvent) {
		if (dragging) mm.scrollTo(stripY(e) - grab);
	}
	const onUp = () => (dragging = false);

	/** px per wheel delta unit, by `deltaMode` (pixels, lines, pages). */
	const WHEEL_UNIT = [1, 16, 400];
	function onWheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) return;
		e.preventDefault();
		mm.wheel(e.deltaY * (WHEEL_UNIT[e.deltaMode] ?? 1));
	}

	/** Scrollbar keys → document steps. */
	function keyStep(e: KeyboardEvent): Parameters<MinimapState['step']> | null {
		switch (e.key) {
			case 'ArrowDown':
				return ['line', 1];
			case 'ArrowUp':
				return ['line', -1];
			case 'PageDown':
				return ['page', 1];
			case 'PageUp':
				return ['page', -1];
			case ' ':
				return ['page', e.shiftKey ? -1 : 1];
			case 'Home':
				return ['start'];
			case 'End':
				return ['end'];
			default:
				return null;
		}
	}
	function onKey(e: KeyboardEvent) {
		const step = keyStep(e);
		if (!step) return;
		e.preventDefault();
		mm.step(...step);
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	/** Tracks the strip height and takes over the wheel (non-passive, to prevent page scroll). */
	const stripAttachment = {
		[createAttachmentKey()]: (node: HTMLElement) => {
			const ro = new ResizeObserver(() => (mm.height = node.clientHeight));
			ro.observe(node);
			mm.height = node.clientHeight;
			const offWheel = on(node, 'wheel', onWheel, { passive: false });
			return () => {
				ro.disconnect();
				offWheel();
			};
		}
	};
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-minimap': '',
			'data-mode': mode,
			'data-variant': variant,
			'data-previews': pageKind,
			'data-dragging': dataAttr(dragging),
			'data-scrollable': dataAttr(mm.scrollable),
			role: 'scrollbar',
			tabindex: 0,
			'aria-orientation': 'vertical' as const,
			'aria-controls': viewer.scrollEl?.id || undefined,
			'aria-valuemin': 1,
			'aria-valuemax': viewer.document.numPages,
			'aria-valuenow': viewer.page,
			'aria-valuetext': viewer.t('page', { page: viewer.document.pageLabel(viewer.page) }),
			'aria-label': viewer.t('pages'),
			style: cssVars({ '--pdf-minimap-width': `${width}px` }),
			onpointerdown: onDown,
			onpointermove: onMove,
			onpointerup: onUp,
			onpointercancel: onUp,
			onkeydown: onKey,
			...refAttachment,
			...stripAttachment
		})
	);
</script>

{#snippet track()}
	<div
		data-pdf-minimap-track=""
		style:--pdf-minimap-total="{mm.total}px"
		style:--pdf-minimap-offset="{mm.offset}px"
	>
		{#if variant === 'spine'}
			{#each bands as b (b.key)}
				<div
					data-pdf-minimap-band=""
					data-index={b.index}
					data-active={dataAttr(isActive(b))}
					title={b.label}
					style:--pdf-minimap-band-top="{b.top}px"
					style:--pdf-minimap-band-height="{b.height}px"
				>
					{#if b.height > 14}<span data-part="label">{b.label}</span>{/if}
				</div>
			{/each}
		{:else if pageKind !== 'none'}
			{#each shown as p (p.page)}
				<div
					data-pdf-minimap-page={p.page}
					data-kind={pageKind}
					data-current={dataAttr(viewer.page === p.page)}
					style:--pdf-minimap-page-left="{p.left}px"
					style:--pdf-minimap-page-top="{p.top}px"
					style:--pdf-minimap-page-width="{p.width}px"
					style:--pdf-minimap-page-height="{p.height}px"
				>
					{#if pageKind === 'pages'}
						<div data-part="preview" {@attach bitmap(p.page)}></div>
					{:else if pageKind === 'text'}
						<canvas data-part="preview" {@attach structure(p.page)}></canvas>
					{:else if p.height >= 12}
						<span data-part="number">{viewer.document.pageLabel(p.page)}</span>
					{/if}
				</div>
			{/each}
		{/if}
		{@render children?.({ minimap: mm })}
	</div>
{/snippet}

{#if child}
	{@render child({ props: mergedProps, minimap: mm })}
{:else}
	<div {...mergedProps}>{@render track()}</div>
{/if}

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-minimap])) {
			position: relative;
			overflow: hidden;
			width: var(--pdf-minimap-width);
			touch-action: none;
			user-select: none;
			cursor: pointer;
		}
		/* Click jumps there; dragging scrubs the document. */
		:global(:where([data-pdf-minimap][data-dragging])) {
			cursor: grabbing;
		}
		/* --pdf-minimap-offset scrolls the strip (updated while the document scrolls). */
		:global(:where([data-pdf-minimap-track])) {
			position: absolute;
			left: 0;
			right: 0;
			top: 0;
			height: var(--pdf-minimap-total);
			transform: translateY(calc(-1 * var(--pdf-minimap-offset)));
		}
		:global(:where([data-pdf-minimap-band])) {
			position: absolute;
			left: 0;
			right: 0;
			top: var(--pdf-minimap-band-top);
			height: var(--pdf-minimap-band-height);
		}
		:global(:where([data-pdf-minimap-page])) {
			position: absolute;
			left: var(--pdf-minimap-page-left);
			top: var(--pdf-minimap-page-top);
			width: var(--pdf-minimap-page-width);
			height: var(--pdf-minimap-page-height);
		}
		:global(:where([data-pdf-minimap-page] > [data-part='preview'])) {
			display: block;
			width: 100%;
			height: 100%;
		}
	}
</style>
