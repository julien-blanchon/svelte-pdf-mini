<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { DocumentContext, ViewerContext } from '../../state/context.js';
	import { ViewerState } from '../../state/viewer.svelte.js';
	import type { ViewerRootProps } from './types.js';

	let {
		zoom = $bindable(1),
		onZoomChange,
		zoomMode = $bindable('auto'),
		onZoomModeChange,
		page = $bindable(1),
		onPageChange,
		rotation = $bindable(0),
		onRotationChange,
		scrollMode = $bindable('vertical'),
		onScrollModeChange,
		columns = $bindable(1),
		onColumnsChange,
		maxColumns,
		firstPageAlone,
		smoothZoom,
		oversampling,
		detailMinWidth,
		focusDuration,
		focusHighlight,
		focusPadding,
		messages,
		keymap,
		pageTheme,
		theme = 'system',
		pageFrame = 'shadow',
		overscan,
		maxCanvasPixels,
		wheelZoom,
		keyboard,
		zoomSteps,
		minZoom,
		maxZoom,
		zoomLocked,
		viewer = $bindable(),
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ViewerRootProps = $props();

	const state = ViewerContext.set(
		new ViewerState({
			document: DocumentContext.get(),
			zoom: () => zoom,
			onZoomChange: (v) => {
				zoom = v;
				onZoomChange?.(v);
			},
			zoomMode: () => zoomMode,
			onZoomModeChange: (v) => {
				zoomMode = v;
				onZoomModeChange?.(v);
			},
			page: () => page,
			onPageChange: (v) => {
				page = v;
				onPageChange?.(v);
			},
			rotation: () => rotation,
			onRotationChange: (v) => {
				rotation = v;
				onRotationChange?.(v);
			},
			scrollMode: () => scrollMode,
			onScrollModeChange: (v) => {
				scrollMode = v;
				onScrollModeChange?.(v);
			},
			columns: () => columns,
			onColumnsChange: (v) => {
				columns = v;
				onColumnsChange?.(v);
			},
			maxColumns: () => maxColumns,
			firstPageAlone: () => firstPageAlone,
			smoothZoom: () => smoothZoom,
			oversampling: () => oversampling,
			detailMinWidth: () => detailMinWidth,
			focusDuration: () => focusDuration,
			focusHighlight: () => focusHighlight,
			focusPadding: () => focusPadding,
			messages: () => messages,
			keymap: () => keymap,
			pageTheme: () => pageTheme,
			overscan: () => overscan,
			maxCanvasPixels: () => maxCanvasPixels,
			wheelZoom: () => wheelZoom,
			keyboard: () => keyboard,
			zoomSteps: () => zoomSteps,
			minZoom: () => minZoom,
			maxZoom: () => maxZoom,
			zoomLocked: () => zoomLocked
		})
	);
	viewer = state;

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-viewer': '',
			'data-theme': theme,
			'data-page-frame': pageFrame,
			'data-page-theme': state.pageTheme.id.split('(')[0],
			'data-status': state.document.status,
			'data-columns': state.effectiveColumns,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, viewer: state })}
{:else}
	<div {...mergedProps}>{@render children?.({ viewer: state })}</div>
{/if}
