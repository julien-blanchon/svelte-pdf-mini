export { default as Root } from './minimap-root.svelte';
export { default as Viewport } from './minimap-viewport.svelte';
export { default as Markers } from './minimap-markers.svelte';
export { default as Heatmap } from './minimap-heatmap.svelte';
export type {
	MinimapRootProps as RootProps,
	MinimapViewportProps as ViewportProps,
	MinimapMarkersProps as MarkersProps,
	MinimapHeatmapProps as HeatmapProps,
	MinimapMarker
} from './types.js';
