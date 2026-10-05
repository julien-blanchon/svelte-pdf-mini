<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { cssVars } from '../../internal/style.js';
	import { AnnotationsContext, FindContext, MinimapContext } from '../../state/context.js';
	import { markerTop } from './position.js';
	import type { MinimapHeatmapProps, MinimapMarker } from './types.js';

	let {
		bin = 6,
		find = true,
		annotations = true,
		items = [],
		color = 'var(--pdf-accent, rgb(37 99 235))',
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: MinimapHeatmapProps = $props();
	const minimap = MinimapContext.get();
	const findState = FindContext.getOr(null);
	const store = AnnotationsContext.getOr(null);

	/** Marker density per strip bin, normalized to 0..1 (empty bins left out). */
	const bins = $derived.by(() => {
		const n = Math.max(1, Math.ceil(minimap.total / bin));
		const counts = new Float32Array(n);
		const add = (marker: MinimapMarker) => {
			const i = Math.floor(markerTop(minimap, marker) / bin);
			counts[Math.min(n - 1, Math.max(0, i))]++;
		};
		if (find && findState) for (const m of findState.matches) add({ page: m.page, y: m.rect?.[3] });
		if (annotations && store) for (const a of store.visible) add({ page: a.page, y: a.rect[3] });
		for (const m of items) add(m);
		const max = Math.max(1, ...counts);
		return Array.from(counts, (c, i) => ({ i, density: c / max })).filter((b) => b.density > 0);
	});
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-minimap-heatmap': '',
			style: cssVars({ '--pdf-minimap-bin': `${bin}px`, '--pdf-minimap-heat-color': color }),
			...refAttachment
		})
	);
</script>

<div {...mergedProps}>
	{#each bins as b (b.i)}
		<div
			data-pdf-minimap-heat=""
			style:--pdf-minimap-heat-top="{b.i * bin}px"
			style:--pdf-minimap-heat={b.density}
		></div>
	{/each}
</div>

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-minimap-heatmap])) {
			position: absolute;
			inset: 0;
			pointer-events: none;
		}
		/* --pdf-minimap-heat: the bin's density (0..1). */
		:global(:where([data-pdf-minimap-heat])) {
			position: absolute;
			left: 0;
			right: 0;
			top: var(--pdf-minimap-heat-top);
			height: var(--pdf-minimap-bin);
			background: var(--pdf-minimap-heat-color);
			opacity: calc(0.15 + 0.85 * var(--pdf-minimap-heat));
		}
	}
</style>
