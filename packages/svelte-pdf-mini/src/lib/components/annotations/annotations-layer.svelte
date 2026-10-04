<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { hitStack, hitTest, simplifyPoints } from '../../core/annotations/geometry.js';
	import type { Annotation, InkPath } from '../../core/annotations/model.js';
	import { isTextMarkup } from '../../core/annotations/model.js';
	import type { PdfPoint, PdfRect } from '../../core/types.js';
	import { pdfRectToPercent, viewportPointToPdf } from '../../core/view/geometry.js';
	import { handleRovingKey } from '../../internal/roving.js';
	import { dataAttr } from '../../internal/types.js';
	import type { AnnotationTool } from '../../state/annotations.svelte.js';
	import { AnnotationsContext, PageContext } from '../../state/context.js';
	import AnnotationDraft from './annotation-draft.svelte';
	import AnnotationFreetext from './annotation-freetext.svelte';
	import AnnotationHandles from './annotation-handles.svelte';
	import AnnotationShape from './annotation-shape.svelte';
	import { annotationCss } from './color.js';
	import {
		movePoint,
		rectFromPoints,
		resizeRect,
		translateAnnotation,
		type DragMode,
		type Draft
	} from './geometry.js';
	import {
		describeAnnotation,
		hoverAnnotation,
		snippetPropsFor,
		unhoverAnnotation
	} from './helpers.js';
	import type { AnnotationsLayerProps } from './types.js';

	let {
		noteIcon,
		areaLabel,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: AnnotationsLayerProps = $props();
	const store = AnnotationsContext.get();
	const page = PageContext.get();
	const viewer = page.viewer;

	const DRAW_TOOLS = new Set<AnnotationTool>([
		'area',
		'note',
		'ink',
		'rect',
		'ellipse',
		'line',
		'arrow',
		'freetext',
		'eraser'
	]);
	/** Selected annotations are drawn last (on top). */
	const annots = $derived.by(() => {
		const list = store.byPage.get(page.pageNumber) ?? [];
		return [
			...list.filter((a) => !store.isSelected(a.id)),
			...list.filter((a) => store.isSelected(a.id))
		];
	});
	/** Reading order (top → bottom, left → right) for keyboard navigation. */
	const reading = $derived(
		annots
			.filter((a) => !a.inReplyTo)
			.sort((a, b) => b.rect[3] - a.rect[3] || a.rect[0] - b.rect[0])
	);
	const vp = $derived(page.viewport);
	const dark = $derived(!!viewer.pageTheme.dark);
	const drawing = $derived(DRAW_TOOLS.has(store.tool) && !store.readonly);
	const colorOf = (a: Annotation) => annotationCss(a, store.palette, dark);
	const isOnPage = (id: string | null) => !!id && annots.some((a) => a.id === id);

	// ── Pointer → PDF space ───────────────────────────────────────────────────
	let layerEl: HTMLElement | null = null;
	function toPdf(e: { clientX: number; clientY: number }): PdfPoint | null {
		const pageEl = layerEl?.closest<HTMLElement>('[data-pdf-page]');
		if (!pageEl || !vp) return null;
		const r = pageEl.getBoundingClientRect();
		const vx = ((e.clientX - r.left) / r.width) * vp.width;
		const vy = ((e.clientY - r.top) / r.height) * vp.height;
		return viewportPointToPdf(vp, vx, vy);
	}
	/** Annotations under the pointer, innermost first. */
	function stackAt(e: MouseEvent): { stack: Annotation[]; pt: PdfPoint | null } {
		const pt = toPdf(e);
		return { stack: pt ? hitStack(annots, pt[0], pt[1]) : [], pt };
	}
	const elementFor = (id: string) =>
		layerEl?.querySelector(`[data-pdf-annotation="${CSS.escape(id)}"]`) ?? null;
	/** Events on our own controls (notes, handles, menus) are not page clicks. */
	const fromAnnotationUi = (e: Event) =>
		e.target instanceof Element && !!e.target.closest('[data-pdf-annotation-ui]');

	// ── Hover cursor + click selection via hit testing (text stays selectable) ──
	const pageKey = createAttachmentKey();
	const attachPage = (node: HTMLElement) => {
		layerEl = node;
		const pageEl = node.closest<HTMLElement>('[data-pdf-page]');
		if (!pageEl) return;
		let down: { x: number; y: number } | null = null;
		let raf = 0;

		const onMove = (e: PointerEvent) => {
			if (drawing || e.buttons) return;
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				const pt = toPdf(e);
				const hit = pt ? hitTest(annots, pt[0], pt[1]) : null;
				// data-annotation-hover drives a pointer cursor (styles.css).
				pageEl.toggleAttribute('data-annotation-hover', !!hit);
				if (hit) {
					if (store.hoveredId !== hit.id) hoverAnnotation(store, hit.id, elementFor(hit.id));
				} else if (isOnPage(store.hoveredId)) {
					store.hoveredId = null;
				}
			});
		};
		const onLeave = () => {
			pageEl.removeAttribute('data-annotation-hover');
			if (isOnPage(store.hoveredId)) store.hoveredId = null;
		};
		const onDown = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		// Don't let a double-click on an annotation select the word underneath.
		const onMouseDown = (e: MouseEvent) => {
			if (e.detail >= 2 && !drawing && stackAt(e).stack.length) e.preventDefault();
		};
		const onUp = (e: PointerEvent) => {
			if (!down || drawing) return;
			const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
			down = null;
			if (moved || !(getSelection()?.isCollapsed ?? true) || fromAnnotationUi(e)) return;
			const { stack, pt } = stackAt(e);
			// Clicking elsewhere keeps a just-created annotation.
			if (store.pendingId && stack[0]?.id !== store.pendingId) store.commit();
			if (stack.length && pt && store.selectOn === 'click') {
				// Innermost first; clicking the same spot again (or Alt+click) cycles through overlaps.
				store.pick(
					stack,
					{ page: page.pageNumber, x: pt[0], y: pt[1] },
					{ cycle: e.altKey, additive: e.shiftKey }
				);
			} else if (!stack.length && !e.shiftKey && store.selectedIds.length) {
				store.select(null);
				store.editingId = null;
			}
		};
		const onDblClick = (e: MouseEvent) => {
			if (drawing || fromAnnotationUi(e)) return;
			const { stack, pt } = stackAt(e);
			if (!stack.length || !pt) return;
			getSelection()?.removeAllRanges();
			if (store.selectOn === 'dblclick')
				store.pick(stack, { page: page.pageNumber, x: pt[0], y: pt[1] }, { additive: e.shiftKey });
			// Double-click edits the note (or a text box's text).
			else store.edit(stack[0].id);
		};

		const offs = [
			on(pageEl, 'pointermove', onMove),
			on(pageEl, 'pointerleave', onLeave),
			on(pageEl, 'pointerdown', onDown),
			on(pageEl, 'mousedown', onMouseDown),
			on(pageEl, 'pointerup', onUp),
			on(pageEl, 'dblclick', onDblClick)
		];
		return () => {
			cancelAnimationFrame(raf);
			for (const off of offs) off();
		};
	};

	// ── Drawing tools ─────────────────────────────────────────────────────────
	let draft = $state.raw<Draft | null>(null);

	/** Pressure for a pointer sample: real for pens, flat 0.5 otherwise (perfect-freehand simulates it from speed). */
	const pressureOf = (e: PointerEvent) =>
		e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;

	function onDrawDown(e: PointerEvent & { currentTarget: HTMLElement }) {
		if (e.button !== 0) return;
		const pt = toPdf(e);
		if (!pt) return;
		e.preventDefault();
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* pointer already released */
		}
		store.setShift(e.shiftKey);
		if (store.pendingId) store.commit();
		const tool = store.tool;
		if (tool === 'eraser') {
			erase(pt);
			draft = { tool, start: pt, end: pt, points: [], pressure: [], pen: false };
			return;
		}
		if (tool === 'note') {
			store.create('note', { page: page.pageNumber, rect: [pt[0], pt[1] - 20, pt[0] + 20, pt[1]] });
			return;
		}
		draft = {
			tool,
			start: pt,
			end: pt,
			points: [pt],
			pressure: [pressureOf(e)],
			pen: e.pointerType === 'pen'
		};
	}

	/** Adds the ink samples of a move (coalesced events give every sample the device produced). */
	function extendInk(d: Draft, e: PointerEvent): Draft {
		const coalesced = e.getCoalescedEvents?.() ?? [];
		const samples = coalesced.length ? coalesced : [e];
		const points = [...d.points];
		const pressure = [...d.pressure];
		for (const s of samples) {
			const pt = toPdf(s);
			if (!pt) continue;
			const last = points[points.length - 1];
			if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.25) continue;
			points.push(pt);
			pressure.push(pressureOf(s));
		}
		return { ...d, points, pressure, end: points[points.length - 1] };
	}

	function onDrawMove(e: PointerEvent) {
		if (!draft) return;
		if (draft.tool === 'ink') {
			draft = extendInk(draft, e);
			return;
		}
		const pt = toPdf(e);
		if (!pt) return;
		if (draft.tool === 'eraser') erase(pt);
		else draft = { ...draft, end: pt };
	}

	function onDrawUp() {
		const d = draft;
		draft = null;
		if (!d || d.tool === 'eraser') return;
		const rect = rectFromPoints(d.start, d.end);
		const big = rect[2] - rect[0] > 4 || rect[3] - rect[1] > 4;
		const pageNumber = page.pageNumber;
		switch (d.tool) {
			case 'area':
			case 'rect':
			case 'ellipse':
				if (big) store.create(d.tool, { page: pageNumber, rect });
				break;
			case 'line':
			case 'arrow':
				if (big) store.create(d.tool, { page: pageNumber, rect, points: [d.start, d.end] });
				break;
			case 'ink': {
				if (d.points.length < 2) break;
				// Light simplification keeps the stroke faithful (perfect-freehand smooths the rest).
				const path: InkPath = d.pen
					? { points: d.points, pressure: d.pressure }
					: { points: simplifyPoints(d.points, 0.15) };
				store.create('ink', { page: pageNumber, rect, paths: [path], style: 'freehand' });
				break;
			}
			case 'freetext': {
				// A click (no drag) opens a default-sized box.
				const r: PdfRect = big ? rect : [d.start[0], d.start[1] - 28, d.start[0] + 200, d.start[1]];
				store.create('freetext', { page: pageNumber, rect: r, text: '' });
				break;
			}
		}
		// store.create made it the pending annotation (note / text open, tool back to select).
	}

	function erase(pt: PdfPoint) {
		const hit = hitTest(annots, pt[0], pt[1], 4);
		if (hit && store.canEdit(hit)) store.remove(hit.id);
	}

	// ── Move / resize selected shapes (selection and handles stay throughout) ──
	type Drag = { id: string; mode: DragMode; start: PdfPoint; origin: Annotation };
	let drag: Drag | null = $state.raw(null);

	function startDrag(e: PointerEvent, a: Annotation, mode: DragMode) {
		if (e.button !== 0 || !store.canEdit(a)) return;
		const pt = toPdf(e);
		if (!pt) return;
		e.preventDefault();
		e.stopPropagation();
		if (store.pendingId && store.pendingId !== a.id) store.commit();
		drag = { id: a.id, mode, start: pt, origin: a };
		const downAt = { x: e.clientX, y: e.clientY };
		let moved = false;
		// Follow the pointer on the window (the handle re-renders while moving).
		const move = (ev: PointerEvent) => {
			if (!moved && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 3) return;
			moved = true;
			onDragMove(ev);
		};
		const up = (ev: PointerEvent) => {
			drag = null;
			stop();
			// A click (no drag) on a selected shape behaves like a click on the page:
			// it picks again, cycling through what overlaps there.
			if (moved || mode !== 'move' || ev.type !== 'pointerup') return;
			const at = toPdf(ev);
			if (!at) return;
			store.pick(
				hitStack(annots, at[0], at[1]),
				{ page: page.pageNumber, x: at[0], y: at[1] },
				{ cycle: true, additive: ev.shiftKey }
			);
		};
		const offs = [
			on(window, 'pointermove', move),
			on(window, 'pointerup', up),
			on(window, 'pointercancel', up)
		];
		const stop = () => offs.forEach((off) => off());
	}

	function onDragMove(e: PointerEvent) {
		if (!drag) return;
		const pt = toPdf(e);
		if (!pt) return;
		const dx = pt[0] - drag.start[0];
		const dy = pt[1] - drag.start[1];
		const { origin: o, mode } = drag;
		switch (mode) {
			case 'move':
				store.update(o.id, () => translateAnnotation(o, dx, dy));
				return;
			case 'p0':
			case 'p1':
				if ('points' in o && o.points) store.update(o.id, movePoint(o.points, mode, dx, dy));
				return;
			default:
				store.update(o.id, {
					rect: resizeRect(o.rect, mode, dx, dy, { keepRatio: e.shiftKey, fromCenter: e.altKey })
				});
		}
	}

	const editableSelected = $derived(
		annots.filter((a) => store.isSelected(a.id) && store.canEdit(a) && !isTextMarkup(a))
	);

	// ── Keyboard: one tab stop per page, arrows move between annotations ────────
	let focusIndex = $state(0);
	const tabStop = $derived(Math.min(focusIndex, reading.length - 1));
	// Reactive so `bind:this={hotspots[i]}` binds to a tracked slot.
	const hotspots = $state<HTMLElement[]>([]);
	function onHotspotKey(e: KeyboardEvent, i: number, a: Annotation) {
		// Arrows nudge a selected, editable shape (handled by the store); otherwise they move focus.
		const nudges = store.isSelected(a.id) && store.canEdit(a) && !isTextMarkup(a);
		if (nudges && e.key.startsWith('Arrow')) return;
		handleRovingKey(e, i, reading.length, {
			orientation: 'both',
			focus: (next) => {
				focusIndex = next;
				hotspots[next]?.focus();
				viewer.focus(
					{ page: page.pageNumber, rect: reading[next].rect },
					{ highlight: false, align: 'nearest' }
				);
			},
			// Enter / Space selects, then edits the note.
			activate: () => (store.isSelected(a.id) ? store.edit(a.id) : store.select(a.id))
		});
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-layer': '',
			'data-tool': store.tool,
			'data-drawing': dataAttr(drawing),
			[pageKey]: attachPage,
			...refAttachment
		})
	);
</script>

<div {...mergedProps}>
	{#if vp}
		<svg
			data-pdf-annotation-svg=""
			data-theme={dark ? 'dark' : 'light'}
			viewBox="0 0 {vp.width} {vp.height}"
			preserveAspectRatio="none"
		>
			{#each annots as a (a.id)}
				<AnnotationShape
					annotation={a}
					{vp}
					color={colorOf(a)}
					selected={store.isSelected(a.id)}
					hovered={store.hoveredId === a.id}
					pending={store.pendingId === a.id}
				/>
			{/each}
			{#if draft && draft.tool !== 'eraser'}
				<AnnotationDraft {draft} {vp} color={store.activeColor.light} />
			{/if}
		</svg>

		<!-- HTML parts (notes, free text, labels, handles, focus targets) sit above the text layer. -->
		<div
			data-pdf-annotation-overlay=""
			role="group"
			aria-label={viewer.t('annotationsOnPage', { page: page.pageNumber })}
		>
			{#each annots as a (a.id)}
				{@const box = pdfRectToPercent(vp, a.rect)}
				{#if a.kind === 'note'}
					<div
						data-pdf-annotation-note=""
						data-selected={dataAttr(store.isSelected(a.id))}
						style:--pdf-left="{box.left}%"
						style:--pdf-top="{box.top}%"
						style:--pdf-width="{box.width}%"
						style:--pdf-height="{box.height}%"
						style:--annotation-color={colorOf(a)}
					>
						{#if noteIcon}{@render noteIcon(snippetPropsFor(store, a, colorOf(a)))}{:else}
							<svg viewBox="0 0 20 20" aria-hidden="true"
								><path
									d="M3 3h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
									fill="currentColor"
									stroke="rgb(0 0 0 / .35)"
									stroke-width=".8"
								/></svg
							>
						{/if}
					</div>
				{:else if a.kind === 'freetext'}
					<AnnotationFreetext
						annotation={a}
						{box}
						color={colorOf(a)}
						selected={store.isSelected(a.id)}
					/>
				{:else if a.kind === 'area' && (a.label || areaLabel)}
					<div
						data-pdf-annotation-label=""
						style:--pdf-left="{box.left}%"
						style:--pdf-top="{box.top}%"
						style:--annotation-color={colorOf(a)}
					>
						{#if areaLabel}{@render areaLabel(
								snippetPropsFor(store, a, colorOf(a))
							)}{:else}{a.label}{/if}
					</div>
				{/if}
			{/each}

			<!-- Keyboard targets: a single tab stop per page; arrows move in reading order. -->
			{#each reading as a, i (a.id)}
				{@const box = pdfRectToPercent(vp, a.rect)}
				<button
					type="button"
					bind:this={hotspots[i]}
					data-pdf-annotation-focus=""
					data-pdf-annotation-ui=""
					tabindex={i === tabStop ? 0 : -1}
					aria-label={describeAnnotation(a, 80, (note) => viewer.t('annotationNote', { note }))}
					aria-pressed={store.isSelected(a.id)}
					style:--pdf-left="{box.left}%"
					style:--pdf-top="{box.top}%"
					style:--pdf-width="{box.width}%"
					style:--pdf-height="{box.height}%"
					onfocus={(e) => {
						focusIndex = i;
						hoverAnnotation(store, a.id, e.currentTarget);
					}}
					onblur={() => unhoverAnnotation(store, a.id)}
					onkeydown={(e) => onHotspotKey(e, i, a)}
				></button>
			{/each}

			<!-- Move / resize handles: shown as soon as a shape is selected, kept while dragging. -->
			{#each editableSelected as a (a.id)}
				<AnnotationHandles
					annotation={a}
					box={pdfRectToPercent(vp, a.rect)}
					{vp}
					dragging={drag?.id === a.id}
					typing={store.editingId === a.id && a.kind === 'freetext'}
					onDragStart={(e, mode) => startDrag(e, a, mode)}
					onEdit={() => store.edit(a.id)}
				/>
			{/each}

			{#if drawing}
				<div
					data-pdf-annotation-ui=""
					data-pdf-draw-surface=""
					data-tool={store.tool}
					role="presentation"
					onpointerdown={onDrawDown}
					onpointermove={onDrawMove}
					onpointerup={onDrawUp}
					onpointercancel={() => (draft = null)}
				></div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* No z-index: the SVG must blend with the page bitmap (a stacking context would isolate it). */
	[data-pdf-annotation-layer] {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	[data-pdf-annotation-svg] {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		mix-blend-mode: multiply;
	}
	/* On dark pages, marks lighten the page instead. */
	[data-pdf-annotation-svg][data-theme='dark'] {
		mix-blend-mode: screen;
	}
	/*
	 * Translucent as well as blended: WebKit (Safari, WKWebView) doesn't always
	 * blend over a GPU-composited canvas, and an opaque fill hides the text.
	 */
	[data-pdf-annotation-svg] :global([data-part='highlight']) {
		fill-opacity: var(--pdf-highlight-opacity, 0.45);
	}
	[data-pdf-annotation-overlay] {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
	}
	/* Overlay parts are placed in percent of the page (--pdf-left/top/width/height). */
	:is([data-pdf-annotation-note], [data-pdf-annotation-focus]) {
		position: absolute;
		left: var(--pdf-left);
		top: var(--pdf-top);
		width: var(--pdf-width);
		height: var(--pdf-height);
	}
	[data-pdf-annotation-note] {
		color: var(--annotation-color);
	}
	[data-pdf-annotation-note] > svg {
		width: 100%;
		height: 100%;
		filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
	}
	[data-pdf-annotation-label] {
		position: absolute;
		left: var(--pdf-left);
		top: var(--pdf-top);
		transform: translateY(-100%);
	}
	/* Focus targets only take keyboard focus: clicks go through to the page. */
	[data-pdf-annotation-focus] {
		pointer-events: none;
	}
	[data-pdf-draw-surface] {
		position: absolute;
		inset: 0;
		pointer-events: auto;
		touch-action: none;
		cursor: crosshair;
	}
	[data-pdf-draw-surface][data-tool='eraser'] {
		cursor: cell;
	}
	[data-pdf-draw-surface][data-tool='note'] {
		cursor: copy;
	}
	/* Hand tool (set on the viewport by the store): drag to scroll. */
	:global(:where([data-pdf-viewport][data-pan])) {
		cursor: grab;
		user-select: none;
	}
	:global(:where([data-pdf-viewport][data-panning])) {
		cursor: grabbing;
	}
</style>
