<!-- Move / resize handles of a selected shape. Internal to Annotations.Layer. -->
<script lang="ts">
	import type { PageViewport } from 'pdfjs-dist';
	import type { Annotation } from '../../core/annotations/model.js';
	import { pdfRectToPercent } from '../../core/view/geometry.js';
	import { dataAttr } from '../../internal/types.js';
	import { isResizable, RESIZE_HANDLES, type DragMode, type PercentBox } from './geometry.js';

	interface Props {
		annotation: Annotation;
		box: PercentBox;
		vp: PageViewport;
		dragging: boolean;
		/** A text box being typed in: its body lets clicks through to the textarea. */
		typing: boolean;
		onDragStart: (e: PointerEvent, mode: DragMode) => void;
		onEdit: () => void;
	}

	let { annotation: a, box, vp, dragging, typing, onDragStart, onEdit }: Props = $props();
	/** End points of a line / arrow, in percent of the page. */
	const ends = $derived.by(() => {
		if ((a.kind !== 'line' && a.kind !== 'arrow') || !a.points) return [];
		return a.points.slice(0, 2).map(([x, y]) => pdfRectToPercent(vp, [x, y, x, y]));
	});
</script>

<div
	data-pdf-annotation-ui=""
	data-pdf-annotation-handles=""
	data-dragging={dataAttr(dragging)}
	data-typing={dataAttr(typing)}
	style:--pdf-left="{box.left}%"
	style:--pdf-top="{box.top}%"
	style:--pdf-width="{box.width}%"
	style:--pdf-height="{box.height}%"
>
	<div
		data-part="body"
		role="presentation"
		onpointerdown={(e) => onDragStart(e, 'move')}
		ondblclick={onEdit}
	></div>
	{#if isResizable(a)}
		{#each RESIZE_HANDLES as h (h)}
			<div
				data-part="handle"
				data-handle={h}
				role="presentation"
				onpointerdown={(e) => onDragStart(e, h)}
			></div>
		{/each}
	{/if}
</div>
{#each ends as p, i (i)}
	<div
		data-pdf-annotation-ui=""
		data-part="handle"
		data-handle={i === 0 ? 'p0' : 'p1'}
		role="presentation"
		style:--pdf-left="{p.left}%"
		style:--pdf-top="{p.top}%"
		onpointerdown={(e) => onDragStart(e, i === 0 ? 'p0' : 'p1')}
	></div>
{/each}

<style>
	@layer svelte-pdf-mini {
		[data-pdf-annotation-handles] {
			position: absolute;
			left: var(--pdf-left);
			top: var(--pdf-top);
			width: var(--pdf-width);
			height: var(--pdf-height);
			pointer-events: none;
		}
		[data-part='body'] {
			position: absolute;
			inset: 0;
			pointer-events: auto;
			cursor: move;
		}
		[data-typing] > [data-part='body'] {
			pointer-events: none;
		}
		[data-part='handle'] {
			position: absolute;
			transform: translate(-50%, -50%);
			pointer-events: auto;
		}
		/* Box handles sit on the corners and edge midpoints; line ends on their point. */
		[data-handle='nw'] {
			left: 0;
			top: 0;
			cursor: nw-resize;
		}
		[data-handle='n'] {
			left: 50%;
			top: 0;
			cursor: n-resize;
		}
		[data-handle='ne'] {
			left: 100%;
			top: 0;
			cursor: ne-resize;
		}
		[data-handle='e'] {
			left: 100%;
			top: 50%;
			cursor: e-resize;
		}
		[data-handle='se'] {
			left: 100%;
			top: 100%;
			cursor: se-resize;
		}
		[data-handle='s'] {
			left: 50%;
			top: 100%;
			cursor: s-resize;
		}
		[data-handle='sw'] {
			left: 0;
			top: 100%;
			cursor: sw-resize;
		}
		[data-handle='w'] {
			left: 0;
			top: 50%;
			cursor: w-resize;
		}
		:is([data-handle='p0'], [data-handle='p1']) {
			left: var(--pdf-left);
			top: var(--pdf-top);
			cursor: crosshair;
		}
	}
</style>
