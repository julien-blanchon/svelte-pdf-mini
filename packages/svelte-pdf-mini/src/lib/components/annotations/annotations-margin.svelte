<script lang="ts">
	import { untrack } from 'svelte';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { pdfRectToPercent } from '../../core/view/geometry.js';
	import type { Annotation } from '../../core/annotations/model.js';
	import Icon from '../../internal/Icon.svelte';
	import { isActivationKey } from '../../internal/roving.js';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext, PageContext } from '../../state/context.js';
	import Comment from './annotations-comment.svelte';
	import {
		hasNote,
		hoverAnnotation,
		snippetPropsFor,
		textBoxOf,
		unhoverAnnotation,
		type CssVars
	} from './helpers.js';
	import type { AnnotationsMarginProps, MarginLayout } from './types.js';

	let {
		filter = defaultFilter,
		gap = 8,
		side = 'right',
		minWidth = 140,
		edge = 8,
		layout = 'auto',
		note,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: AnnotationsMarginProps = $props();
	const store = AnnotationsContext.get();
	const page = PageContext.get();

	/** Default: annotations with a comment or a label, and the one whose new note is being typed. */
	function defaultFilter(a: Annotation): boolean {
		return hasNote(a) || (store.editingId === a.id && a.kind !== 'freetext');
	}

	/** Side notes in page order, with their anchor (fraction of the page height). */
	const notes = $derived.by(() => {
		const vp = page.viewport;
		if (!vp) return [];
		return (store.byPage.get(page.pageNumber) ?? [])
			.filter((a) => !a.inReplyTo && filter(a))
			.map((a) => ({ a, top: pdfRectToPercent(vp, a.rect).top / 100 }))
			.sort((x, y) => x.top - y.top);
	});

	/** Size of a compact marker (px). */
	const MARKER = 22;
	/** Height assumed for a note not measured yet (px). */
	const NOTE_HEIGHT = 48;
	/** Distance from the page edge to the margin (`--pdf-margin-gap`), measured. */
	let offset = $state(16);
	/** Space kept between notes and the page's text (px). */
	const TEXT_GAP = 8;
	/** Widest a note gets (`--pdf-margin-width`), measured. */
	let maxWidth = $state(240);

	// The page's text box: notes may cover the blank page margin beside it when the view is tight.
	let textBox = $state.raw<[number, number, number, number] | null>(null);
	$effect(() => {
		const n = page.pageNumber;
		if (!page.isNear || !notes.length) return;
		let alive = true;
		page.viewer.document.getTextContent(n).then(
			(tc) => alive && (textBox = textBoxOf(tc.items)),
			() => {}
		);
		return () => {
			alive = false;
		};
	});
	/** Blank page margin on the notes' side that notes may cover (px). */
	const blank = $derived.by(() => {
		const vp = page.viewport;
		if (!vp || !textBox) return 0;
		const r = pdfRectToPercent(vp, textBox);
		const free = side === 'right' ? 100 - r.left - r.width : r.left;
		return Math.max(0, (free / 100) * page.size.width - TEXT_GAP);
	});
	/** A comfortable note width: notes only cover the page margin to get this wide. */
	const COMFORT = 180;
	/**
	 * Width a note takes: the room beside the page, or, when that is narrower than
	 * comfortable, as much of the blank page margin as it takes to get there.
	 */
	const width = $derived.by(() => {
		const outside = Math.min(maxWidth, page.viewer.sideRoom - offset - edge);
		const target = Math.min(maxWidth, COMFORT);
		return outside >= target ? outside : Math.min(target, page.viewer.sideRoom - edge + blank);
	});
	/** Distance from the page edge to the notes: `offset` when they fit outside, negative when they overlap the page. */
	const shift = $derived(Math.min(offset, page.viewer.sideRoom - edge - width));
	/** Another page right beside on this side (a spread): only markers fit, in the gap. */
	const neighbor = $derived(page.viewer.hasNeighbor(page.pageNumber, side));
	/** Full notes when they fit, else compact markers (unless forced). */
	const mode = $derived.by((): Exclude<MarginLayout, 'auto'> => {
		if (layout !== 'auto') return layout;
		// Thumbnail-sized pages (zoomed out, grids) get markers: full notes would dwarf them.
		return width >= minWidth && !neighbor && page.detailed ? 'notes' : 'markers';
	});
	// Markers sit in the room beside the page when there is some, else on the page's edge;
	// next to another page, just past this page's edge, over the neighbor's blank margin.
	const markerPlacement = $derived.by(() => {
		if (neighbor) return 'gap';
		return page.viewer.sideRoom >= MARKER + 8 ? 'outside' : 'inside';
	});
	/** Gap between the page and outside markers: centered in the room, at most `offset`. */
	const markerGap = $derived(Math.min(offset, (page.viewer.sideRoom - MARKER) / 2));

	// Measured note heights → stacked positions without overlaps.
	let heights = $state<Record<string, number>>({});
	// Forget notes that are gone.
	$effect(() => {
		const ids = new Set(notes.map((n) => n.a.id));
		const stale = untrack(() => Object.keys(heights)).filter((id) => !ids.has(id));
		for (const id of stale) delete heights[id];
	});
	const slotHeight = (id: string) => (mode === 'markers' ? MARKER : (heights[id] ?? NOTE_HEIGHT));
	const positions = $derived.by(() => {
		const pageHeight = page.size.height;
		const out: Record<string, number> = {};
		let bottom = -Infinity;
		for (const { a, top } of notes) {
			const y = Math.max(top * pageHeight, bottom + gap);
			out[a.id] = y;
			bottom = y + slotHeight(a.id);
		}
		return out;
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		if (!node) return;
		const css = getComputedStyle(node);
		const gapPx = parseFloat(css.getPropertyValue('--pdf-margin-gap'));
		if (Number.isFinite(gapPx)) offset = gapPx;
		const widthPx = parseFloat(css.getPropertyValue('--pdf-margin-width'));
		if (Number.isFinite(widthPx)) maxWidth = widthPx;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-margin': '',
			'data-side': side,
			'data-layout': mode,
			'data-placement': mode === 'markers' ? markerPlacement : undefined,
			style: {
				'--pdf-margin-note-width': `${Math.max(0, width)}px`,
				'--pdf-margin-shift': `${shift}px`,
				'--pdf-margin-marker-size': `${MARKER}px`,
				'--pdf-margin-marker-gap': `${markerGap}px`
			} satisfies CssVars,
			...refAttachment
		})
	);
</script>

{#if store.notesVisible}
	<div {...mergedProps}>
		{#if mode === 'markers'}
			{#each notes as { a } (a.id)}
				{@const props = snippetPropsFor(store, a)}
				<button
					type="button"
					data-pdf-margin-marker=""
					data-pdf-annotation-ui=""
					data-selected={dataAttr(props.selected)}
					data-hovered={dataAttr(props.hovered)}
					aria-pressed={props.selected}
					aria-label={a.label || a.contents?.trim().slice(0, 80) || page.viewer.t('tool_note')}
					style:--pdf-top="{positions[a.id] ?? 0}px"
					style:--annotation-color={props.color}
					onpointerenter={(e) => hoverAnnotation(store, a.id, e.currentTarget)}
					onfocus={(e) => hoverAnnotation(store, a.id, e.currentTarget)}
					onpointerleave={() => unhoverAnnotation(store, a.id)}
					onclick={() => store.select(a.id)}><Icon name="comment" size={12} /></button
				>
			{/each}
		{:else}
			{#each notes as { a } (a.id)}
				{@const props = { ...snippetPropsFor(store, a), editing: store.editingId === a.id }}
				<!-- A group, not a button: it holds the comment's own controls. Enter / Space select it. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					data-pdf-margin-note=""
					data-pdf-annotation-ui=""
					data-selected={dataAttr(props.selected)}
					data-hovered={dataAttr(props.hovered)}
					role="group"
					aria-label={a.label || a.contents?.trim().slice(0, 80) || page.viewer.t('tool_note')}
					tabindex="0"
					style:--pdf-top="{positions[a.id] ?? 0}px"
					style:--annotation-color={props.color}
					bind:offsetHeight={() => heights[a.id] ?? 0, (h) => (heights[a.id] = h)}
					onpointerenter={(e) => hoverAnnotation(store, a.id, e.currentTarget)}
					onpointerleave={() => unhoverAnnotation(store, a.id)}
					onclick={() => store.select(a.id)}
					onkeydown={(e) => {
						// Only for the note itself: its comment handles its own keys.
						if (e.target !== e.currentTarget || !isActivationKey(e)) return;
						e.preventDefault();
						store.select(a.id);
					}}
				>
					{#if note}
						{@render note(props)}
					{:else}
						{#if a.label}<strong data-part="label">{a.label}</strong>{/if}
						<Comment annotation={a} autofocus={props.editing && a.kind !== 'freetext'} />
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/if}

<style>
	@layer svelte-pdf-mini {
		/* Scoped (not :where) so marker geometry wins over the theme's `all: unset`. */
		[data-pdf-annotation-margin] {
			position: absolute;
			top: 0;
			bottom: 0;
		}
		/* Notes: beside the page, over its blank margin when the view is tight. */
		[data-layout='notes'] {
			width: var(--pdf-margin-note-width);
			z-index: 3;
		}
		[data-layout='notes'][data-side='right'] {
			left: calc(100% + var(--pdf-margin-shift));
		}
		[data-layout='notes'][data-side='left'] {
			right: calc(100% + var(--pdf-margin-shift));
		}
		/* Markers: in the room beside the page, or on the page's edge when there is none. */
		[data-layout='markers'] {
			width: var(--pdf-margin-marker-size);
		}
		[data-placement='outside'][data-side='right'] {
			left: calc(100% + var(--pdf-margin-marker-gap));
		}
		[data-placement='outside'][data-side='left'] {
			right: calc(100% + var(--pdf-margin-marker-gap));
		}
		[data-placement='gap'][data-side='right'] {
			left: calc(100% + 4px);
		}
		[data-placement='gap'][data-side='left'] {
			right: calc(100% + 4px);
		}
		[data-placement='inside'][data-side='right'] {
			right: 4px;
		}
		[data-placement='inside'][data-side='left'] {
			left: 4px;
		}
		[data-pdf-margin-note] {
			position: absolute;
			left: 0;
			right: 0;
			top: var(--pdf-top);
		}
		[data-pdf-margin-marker] {
			position: absolute;
			left: 0;
			top: var(--pdf-top);
			width: var(--pdf-margin-marker-size);
			height: var(--pdf-margin-marker-size);
		}
	}
</style>
