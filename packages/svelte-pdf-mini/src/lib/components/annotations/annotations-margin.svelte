<script lang="ts">
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
		unhoverAnnotation,
		type CssVars
	} from './helpers.js';
	import type { AnnotationsMarginProps, MarginLayout } from './types.js';

	let {
		filter = defaultFilter,
		gap = 8,
		side = 'right',
		minWidth = 160,
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
	/** Width available beside the page, keeping `offset` on both sides of the margin. */
	const room = $derived(page.viewer.sideRoom - 2 * offset);
	/** Full notes when they fit beside the page, else compact markers (unless forced). */
	const mode = $derived.by((): Exclude<MarginLayout, 'auto'> => {
		if (layout !== 'auto') return layout;
		return room >= minWidth ? 'notes' : 'markers';
	});
	// Markers sit in the room beside the page when there is some, else on the page's edge.
	const markerPlacement = $derived(page.viewer.sideRoom >= MARKER + 8 ? 'outside' : 'inside');
	/** Gap between the page and outside markers: centred in the room, at most `offset`. */
	const markerGap = $derived(Math.min(offset, (page.viewer.sideRoom - MARKER) / 2));

	// Measured note heights → stacked positions without overlaps.
	let heights = $state<Record<string, number>>({});
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
		const gapPx = parseFloat(getComputedStyle(node).getPropertyValue('--pdf-margin-gap'));
		if (Number.isFinite(gapPx)) offset = gapPx;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-margin': '',
			'data-side': side,
			'data-layout': mode,
			'data-placement': mode === 'markers' ? markerPlacement : undefined,
			style: {
				'--pdf-margin-room': `${Math.max(0, room)}px`,
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
				<div
					data-pdf-margin-note=""
					data-pdf-annotation-ui=""
					data-selected={dataAttr(props.selected)}
					data-hovered={dataAttr(props.hovered)}
					role="button"
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
	/* Scoped (not :where) so marker geometry wins over the theme's `all: unset`. */
	[data-pdf-annotation-margin] {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	/* Notes: beside the page, as wide as the room allows. */
	[data-layout='notes'] {
		width: min(var(--pdf-margin-width, 240px), var(--pdf-margin-room));
	}
	[data-layout='notes'][data-side='right'] {
		left: calc(100% + var(--pdf-margin-gap, 16px));
	}
	[data-layout='notes'][data-side='left'] {
		right: calc(100% + var(--pdf-margin-gap, 16px));
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
</style>
