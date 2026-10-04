<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { annotationCss } from '../annotations/color.js';
	import {
		AnnotationsContext,
		FindContext,
		MinimapContext,
		PaperContext
	} from '../../state/context.js';
	import { markerHeight, markerTop } from './position.js';
	import type { MinimapMarker, MinimapMarkersProps } from './types.js';

	let {
		items = [],
		find = false,
		annotations = false,
		sections = false,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: MinimapMarkersProps = $props();
	const minimap = MinimapContext.get();
	const findState = FindContext.getOr(null);
	const store = AnnotationsContext.getOr(null);
	const paper = PaperContext.getOr(null);

	/** Every marker to draw, with a stable key and its strip position (px). */
	const all = $derived.by(() => {
		const out: (MinimapMarker & { key: string })[] = items.map((m, i) => ({ ...m, key: `i${i}` }));
		if (find && findState)
			for (const m of findState.matches)
				out.push({
					key: `f${m.index}`,
					kind: m.index === findState.current ? 'find-current' : 'find',
					page: m.page,
					y: m.rect?.[3]
				});
		if (annotations && store)
			for (const a of store.ordered)
				out.push({
					key: `a${a.id}`,
					kind: 'annotation',
					page: a.page,
					y: a.rect[3],
					height: a.rect[3] - a.rect[1],
					color: annotationCss(a, store.palette, false),
					label: a.contents
				});
		if (sections && paper)
			for (const s of paper.flatSections.filter((s) => s.level <= 2))
				out.push({
					key: `s${s.id}`,
					kind: s.level === 1 ? 'section' : 'subsection',
					page: s.page,
					y: s.y,
					label: s.number ? `${s.number} ${s.title}` : s.title
				});
		return out.map((m) => ({
			...m,
			stripTop: markerTop(minimap, m),
			stripHeight: markerHeight(minimap, m)
		}));
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, { 'data-pdf-minimap-markers': '', ...refAttachment })
	);
</script>

<div {...mergedProps}>
	{#each all as m (m.key)}
		<div
			data-pdf-minimap-marker=""
			data-kind={m.kind}
			title={m.label}
			style:--pdf-minimap-marker-top="{m.stripTop}px"
			style:--marker-color={m.color}
			style:--pdf-minimap-marker-height={m.stripHeight
				? `${Math.max(2, m.stripHeight)}px`
				: undefined}
		></div>
	{/each}
</div>

<style>
	:global(:where([data-pdf-minimap-markers])) {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	:global(:where([data-pdf-minimap-marker])) {
		position: absolute;
		top: var(--pdf-minimap-marker-top);
	}
</style>
