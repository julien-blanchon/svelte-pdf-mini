<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { layoutLanes } from '../../core/annotations/geometry.js';
	import type { Annotation } from '../../core/annotations/model.js';
	import { pdfRectToPercent } from '../../core/view/geometry.js';
	import { handleRovingKey } from '../../internal/roving.js';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext, PageContext } from '../../state/context.js';
	import { hasNote, hoverAnnotation, themedColor, unhoverAnnotation } from './helpers.js';
	import type { AnnotationsLineMarkersProps } from './types.js';

	let {
		markers = 'notes',
		filter,
		side = 'left',
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: AnnotationsLineMarkersProps = $props();
	const store = AnnotationsContext.get();
	const page = PageContext.get();

	function shown(a: Annotation): boolean {
		if (a.inReplyTo) return false;
		if (filter) return filter(a);
		return markers === 'all' || hasNote(a);
	}

	// One bar per annotation; overlapping ranges go to separate lanes so each stays clickable.
	const marks = $derived.by(() => {
		const vp = page.viewport;
		if (!vp) return [];
		const list = (store.byPage.get(page.pageNumber) ?? [])
			.filter(shown)
			.map((a) => ({ a, box: pdfRectToPercent(vp, a.rect) }));
		const { lanes } = layoutLanes(
			list.map(({ box }) => ({ top: box.top, bottom: box.top + box.height })),
			0.4
		);
		return list.map((m, i) => ({ ...m, lane: lanes[i] })).sort((x, y) => x.box.top - y.box.top);
	});

	// Roving focus: one tab stop, arrows move between markers in page order.
	let focusIndex = $state(0);
	const tabStop = $derived(Math.min(focusIndex, marks.length - 1));
	const items: HTMLButtonElement[] = [];
	function onKeydown(e: KeyboardEvent, i: number, a: Annotation) {
		handleRovingKey(e, i, marks.length, {
			focus: (next) => {
				focusIndex = next;
				items[next]?.focus();
			},
			activate: () => store.select(a.id)
		});
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-line-markers': '',
			'data-side': side,
			role: 'group',
			'aria-label': `Annotation markers, page ${page.pageNumber}`,
			...refAttachment
		})
	);
</script>

{#if store.notesVisible}
	<div {...mergedProps}>
		{#each marks as { a, box, lane }, i (a.id)}
			{@const selected = store.isSelected(a.id)}
			<button
				type="button"
				bind:this={items[i]}
				tabindex={i === tabStop ? 0 : -1}
				data-pdf-line-marker=""
				data-pdf-annotation-ui=""
				data-lane={lane}
				data-hovered={dataAttr(store.hoveredId === a.id)}
				data-selected={dataAttr(selected)}
				aria-pressed={selected}
				aria-label={a.label ?? a.contents ?? a.kind}
				style:--pdf-top="{box.top}%"
				style:--pdf-height="{box.height}%"
				style:--pdf-lane={lane}
				style:--annotation-color={themedColor(store, a)}
				onpointerenter={(e) => hoverAnnotation(store, a.id, e.currentTarget)}
				onpointerleave={() => unhoverAnnotation(store, a.id)}
				onfocus={(e) => {
					focusIndex = i;
					hoverAnnotation(store, a.id, e.currentTarget);
				}}
				onblur={() => unhoverAnnotation(store, a.id)}
				onclick={() => store.select(a.id)}
				onkeydown={(e) => onKeydown(e, i, a)}
			></button>
		{/each}
	</div>
{/if}

<style>
	/* Scoped (not :where) so they win over the theme's `all: unset` on the bars. */
	[data-pdf-line-markers] {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 0;
		z-index: 4;
	}
	[data-pdf-line-markers][data-side='left'] {
		left: var(--pdf-marker-inset, 8px);
	}
	[data-pdf-line-markers][data-side='right'] {
		right: var(--pdf-marker-inset, 8px);
	}
	[data-pdf-line-marker] {
		--pdf-lane-offset: calc(
			var(--pdf-lane) * (var(--pdf-marker-width, 3px) + var(--pdf-marker-gap, 3px))
		);
		top: var(--pdf-top);
		height: max(var(--pdf-height), 6px);
	}
	[data-side='left'] > [data-pdf-line-marker] {
		left: var(--pdf-lane-offset);
	}
	[data-side='right'] > [data-pdf-line-marker] {
		right: var(--pdf-lane-offset);
	}
</style>
