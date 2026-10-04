<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { cssVars } from '../../internal/style.js';
	import { dataAttr } from '../../internal/types.js';
	import { MinimapContext } from '../../state/context.js';
	import { MinimapDragContext } from './drag-context.js';
	import type { MinimapViewportProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: MinimapViewportProps = $props();
	const minimap = MinimapContext.get();
	const drag = MinimapDragContext.getOr(null);
	const dragging = $derived(drag?.dragging ?? false);
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	// Updated on every scroll frame: only custom properties change.
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-minimap-viewport': '',
			'data-dragging': dataAttr(dragging),
			style: cssVars({
				'--pdf-minimap-indicator-top': `${minimap.indicator.top}px`,
				'--pdf-minimap-indicator-height': `${minimap.indicator.height}px`
			}),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, dragging })}
{:else}
	<div {...mergedProps}>{@render children?.({ dragging })}</div>
{/if}

<style>
	:global(:where([data-pdf-minimap-viewport])) {
		position: absolute;
		left: 0;
		right: 0;
		top: var(--pdf-minimap-indicator-top);
		height: var(--pdf-minimap-indicator-height);
		pointer-events: none;
	}
</style>
