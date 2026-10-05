<!-- One annotation drawn in the layer's SVG (viewport space). Internal to Annotations.Layer. -->
<svelte:options namespace="svg" />

<script lang="ts">
	import type { PageViewport } from 'pdfjs-dist';
	import { freehandOutline, outlineToSvgPath } from '../../core/annotations/freehand.js';
	import {
		arrowHead,
		inkPath,
		polyPath,
		quadLine,
		quadSquiggle,
		quadPoints,
		rectToView,
		toView
	} from '../../core/annotations/geometry.js';
	import type { Annotation } from '../../core/annotations/model.js';

	import { HIGHLIGHT_PAD } from '../../core/annotations/geometry.js';
	import { dataAttr } from '../../internal/types.js';

	interface Props {
		annotation: Annotation;
		vp: PageViewport;
		/** CSS color for the current page theme. */
		color: string;
		selected: boolean;
		hovered: boolean;
		pending: boolean;
	}

	let { annotation: a, vp, color: c, selected, hovered, pending }: Props = $props();
	const toViewPt = (p: [number, number]) => toView(vp, p);
</script>

<g
	data-pdf-annotation={a.id}
	data-kind={a.kind}
	data-color={a.paletteKey}
	data-selected={dataAttr(selected)}
	data-hovered={dataAttr(hovered)}
	data-pending={dataAttr(pending)}
	data-foreign={dataAttr(a.origin === 'foreign')}
	opacity={a.opacity}
	style:--annotation-color={c}
>
	{#if a.kind === 'highlight'}
		{#each a.quads as q, i (i)}<polygon
				data-part="highlight"
				points={quadPoints(vp, q, HIGHLIGHT_PAD)}
				fill={c}
			/>{/each}
	{:else if a.kind === 'underline' || a.kind === 'strikeout'}
		{#each a.quads as q, i (i)}
			{@const l = quadLine(vp, q, a.kind === 'underline' ? 0.94 : 0.55)}
			<line
				data-part={a.kind}
				x1={l.x1}
				y1={l.y1}
				x2={l.x2}
				y2={l.y2}
				stroke={c}
				stroke-width={Math.max(0.8, l.height * 0.08)}
				stroke-linecap="round"
			/>
		{/each}
	{:else if a.kind === 'squiggly'}
		{#each a.quads as q, i (i)}<path
				data-part="squiggly"
				d={quadSquiggle(vp, q)}
				fill="none"
				stroke={c}
				stroke-width="0.9"
				stroke-linejoin="round"
			/>{/each}
	{:else if a.kind === 'area' || a.kind === 'rect'}
		{@const b = rectToView(vp, a.rect)}
		<rect
			data-part={a.kind}
			x={b.x}
			y={b.y}
			width={b.width}
			height={b.height}
			rx="2"
			fill={a.kind === 'area' ? c : 'none'}
			fill-opacity={a.kind === 'area' ? (a.fillOpacity ?? 0.12) : 0}
			stroke={c}
			stroke-width={a.width ?? 1.5}
			stroke-dasharray={'dash' in a && a.dash ? a.dash.join(' ') : undefined}
		/>
	{:else if a.kind === 'ellipse'}
		{@const b = rectToView(vp, a.rect)}
		<ellipse
			data-part="ellipse"
			cx={b.x + b.width / 2}
			cy={b.y + b.height / 2}
			rx={b.width / 2}
			ry={b.height / 2}
			fill="none"
			stroke={c}
			stroke-width={a.width}
		/>
	{:else if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'polyline' || a.kind === 'polygon') && a.points}
		<path
			data-part={a.kind}
			d={polyPath(vp, a.points, a.kind === 'polygon')}
			fill="none"
			stroke={c}
			stroke-width={a.width}
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		{#if a.kind === 'arrow' && a.points.length > 1}
			<path
				d={arrowHead(
					vp,
					a.points[a.points.length - 2],
					a.points[a.points.length - 1],
					6 + a.width * 2
				)}
				fill="none"
				stroke={c}
				stroke-width={a.width}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}
	{:else if a.kind === 'ink'}
		{#each a.paths as p, i (i)}
			{#if (a.style ?? 'line') === 'freehand'}
				<path
					data-part="ink"
					d={outlineToSvgPath(freehandOutline(p, a.width, a.freehand), toViewPt)}
					fill={c}
				/>
			{:else}
				<path
					data-part="ink"
					d={inkPath(vp, p)}
					fill="none"
					stroke={c}
					stroke-width={a.width}
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}
		{/each}
	{:else if a.kind === 'note' || a.kind === 'freetext' || a.kind === 'stamp'}
		{@const b = rectToView(vp, a.rect)}
		<!-- An invisible hit box (the note icon and the text box are drawn in HTML). -->
		<rect data-part="hitbox" x={b.x} y={b.y} width={b.width} height={b.height} fill="transparent" />
	{/if}
</g>
