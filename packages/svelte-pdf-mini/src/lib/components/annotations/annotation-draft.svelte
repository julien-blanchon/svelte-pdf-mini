<!-- Live preview of the shape being drawn. Internal to Annotations.Layer. -->
<svelte:options namespace="svg" />

<script lang="ts">
	import type { PageViewport } from 'pdfjs-dist';
	import { freehandOutline, outlineToSvgPath } from '../../core/annotations/freehand.js';
	import { polyPath, rectToView, toView } from '../../core/annotations/geometry.js';
	import { rectFromPoints, type Draft } from './geometry.js';

	let { draft, vp, color }: { draft: Draft; vp: PageViewport; color: string } = $props();
	const r = $derived(rectToView(vp, rectFromPoints(draft.start, draft.end)));
	const inkD = $derived.by(() => {
		if (draft.tool !== 'ink') return '';
		const pressure = draft.pen ? draft.pressure : undefined;
		return outlineToSvgPath(freehandOutline({ points: draft.points, pressure }, 2), (p) =>
			toView(vp, p)
		);
	});
</script>

<g data-pdf-annotation-draft="" data-kind={draft.tool} style:--annotation-color={color}>
	{#if draft.tool === 'ink'}
		<path d={inkD} fill={color} />
	{:else if draft.tool === 'line' || draft.tool === 'arrow'}
		<path d={polyPath(vp, [draft.start, draft.end])} stroke={color} stroke-width="1.5" />
	{:else if draft.tool === 'ellipse'}
		<ellipse
			cx={r.x + r.width / 2}
			cy={r.y + r.height / 2}
			rx={r.width / 2}
			ry={r.height / 2}
			fill="none"
			stroke={color}
			stroke-width="1.5"
		/>
	{:else}
		<rect
			x={r.x}
			y={r.y}
			width={r.width}
			height={r.height}
			fill={draft.tool === 'area' ? color : 'none'}
			fill-opacity="0.15"
			stroke={color}
			stroke-width="1.5"
			stroke-dasharray={draft.tool === 'freetext' ? '4 3' : undefined}
		/>
	{/if}
</g>
