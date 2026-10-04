export { default as Root } from './viewer-root.svelte';
export { default as Viewport } from './viewer-viewport.svelte';
export { default as Pages } from './viewer-pages.svelte';
export { default as Page } from './viewer-page.svelte';
export { default as Canvas } from './viewer-canvas.svelte';
export { default as TextLayer } from './viewer-text-layer.svelte';
export { default as Focus } from './viewer-focus.svelte';
export { default as LinkLayer } from './viewer-link-layer.svelte';
export { default as LinkPreview } from './viewer-link-preview.svelte';
export { default as BackButton } from './viewer-back-button.svelte';
export type {
	ViewerRootProps as RootProps,
	ViewerViewportProps as ViewportProps,
	ViewerPagesProps as PagesProps,
	ViewerPageProps as PageProps,
	ViewerCanvasProps as CanvasProps,
	ViewerTextLayerProps as TextLayerProps,
	ViewerFocusProps as FocusProps,
	ViewerLinkLayerProps as LinkLayerProps,
	ViewerLinkPreviewProps as LinkPreviewProps,
	ViewerBackButtonProps as BackButtonProps,
	PageSnippetProps,
	LinkInfo
} from './types.js';
