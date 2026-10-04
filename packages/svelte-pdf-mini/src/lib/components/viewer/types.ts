import type { PageThemeInput } from '../../core/view/theme.js';
import type { Columns, FocusHighlight, Rotation, ScrollMode, ZoomMode } from '../../core/types.js';
import type { ButtonPartProps, DivPartProps } from '../../internal/component-types.js';
import type { LinkKind } from '../../core/paper/types.js';
import type { ViewerState } from '../../state/viewer.svelte.js';
import type { Messages } from '../../core/i18n/messages.js';
import type { Keymap } from '../../core/i18n/keymap.js';

export interface PageSnippetProps {
	pageNumber: number;
	width: number;
	height: number;
	isNear: boolean;
	isVisible: boolean;
	isCurrent: boolean;
	scale: number;
}

export type ViewerRootProps = DivPartProps<
	{
		/** 1 = 100%. Bindable. */
		zoom?: number;
		onZoomChange?: (zoom: number) => void;
		/** 'auto' | 'page-width' | 'page-height' | 'page-fit' | 'manual'. Bindable. */
		zoomMode?: ZoomMode;
		onZoomModeChange?: (mode: ZoomMode) => void;
		/** Current page (1-based). Bindable; setting it scrolls. */
		page?: number;
		onPageChange?: (page: number) => void;
		rotation?: Rotation;
		onRotationChange?: (rotation: Rotation) => void;
		scrollMode?: ScrollMode;
		onScrollModeChange?: (mode: ScrollMode) => void;
		/** Pages per row: 1–4 or 'auto' (more pages per row as you zoom out). Bindable. */
		columns?: Columns;
		onColumnsChange?: (columns: Columns) => void;
		/** Upper bound for 'auto' columns. Default 4. */
		maxColumns?: number;
		/** Book layout: first page alone (cover), then spreads. */
		firstPageAlone?: boolean;
		/** Ease zoom changes (wheel, buttons, fit modes, zoomTo). Default true. */
		smoothZoom?: boolean;
		/** Render zoomed-out pages at up to 2× so quick zoom-ins stay sharp. Default true. */
		oversampling?: boolean;
		/** Pages narrower than this (CSS px) skip text layers / text indexing. Default 260. */
		detailMinWidth?: number;
		/** Focus highlight duration in ms. Default 1800. */
		focusDuration?: number;
		/** Padding (PDF points) around focused rects. Default 6. */
		focusPadding?: number | [number, number];
		/** UI strings (e.g. a translation); merged over setMessages() and the English defaults. */
		messages?: Partial<Messages>;
		/** Keyboard shortcuts (merged over `defaultKeymap`); annotations use them too. */
		keymap?: Partial<Keymap>;
		/** Page content theme: 'none' | 'invert' | 'dim' | 'sepia' | 'recolor' or a strategy. */
		pageTheme?: PageThemeInput;
		/** UI theme hint exposed as data-theme. */
		theme?: 'light' | 'dark' | 'system';
		/**
		 * Page edge style (exposed as data-page-frame, styled by styles.css):
		 * 'shadow' (default), 'border', 'rounded', 'flat' (no edge) or 'none' (no frame, no background).
		 */
		pageFrame?: 'shadow' | 'border' | 'rounded' | 'flat' | 'none' | (string & {});
		/** Render pages within N viewport-lengths. Default 1. */
		overscan?: number;
		maxCanvasPixels?: number;
		wheelZoom?: boolean;
		keyboard?: boolean;
		zoomSteps?: number[];
		/** The viewer state (bind:viewer to call commands from outside). */
		viewer?: ViewerState;
	},
	{ viewer: ViewerState }
>;

export type ViewerViewportProps = DivPartProps<Record<never, never>, { viewer: ViewerState }>;
export type ViewerPagesProps = DivPartProps<Record<never, never>, { pageNumber: number }>;
export type ViewerPageProps = DivPartProps<{ pageNumber: number }, PageSnippetProps>;
export type ViewerCanvasProps = DivPartProps<Record<never, never>, { rendered: boolean }>;
export type ViewerTextLayerProps = DivPartProps;
export type ViewerFocusProps = DivPartProps<
	Record<never, never>,
	{ highlight: FocusHighlight; duration: number }
>;
export interface LinkInfo {
	page: number;
	rect: [number, number, number, number];
	dest?: string | unknown[];
	url?: string;
	kind: LinkKind;
}
export type ViewerLinkLayerProps = DivPartProps<{
	/** How external URLs open. Default 'new-tab'. */
	external?: 'new-tab' | 'same-tab';
	/** Replace the click action (e.g. open a cited paper in your app). Return false to skip the default. */
	onLinkClick?: (link: LinkInfo, event: MouseEvent) => void | false;
}>;
export type ViewerLinkPreviewProps = DivPartProps<
	{
		/** Preview width in CSS px. Default 420. */ width?: number;
		/** Only preview these link kinds. */ kinds?: LinkKind[];
		/** Keep rendering `child` while closed (with `open: false`) for exit transitions. */ forceMount?: boolean;
		onOpenChange?: (open: boolean) => void;
		placement?: 'top' | 'bottom' | 'left' | 'right';
	},
	{
		open: boolean;
		kind: LinkKind;
		page: number;
		url?: string;
		canvasProps?: Record<string | symbol, unknown>;
	}
>;
export type ViewerBackButtonProps = ButtonPartProps<
	{ /** Render even when there is nowhere to go back to. */ forceMount?: boolean },
	{ page: number | null; label: string }
>;
