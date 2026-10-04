import type { DivPartProps } from '../../internal/component-types.js';
import type { MinimapState, MinimapVariant } from '../../state/minimap.svelte.js';

export type MinimapRootProps = DivPartProps<
	{
		/** Strip width in CSS px. Default 80. */
		width?: number;
		/** 'scroll' (code-editor style, default) or 'fit' (whole document shrunk to the strip). */
		mode?: 'scroll' | 'fit';
		gap?: number;
		/**
		 * Look of the strip:
		 * - 'pages': bitmap previews (blocks when pages get too small to read),
		 * - 'blocks': plain page blocks with numbers,
		 * - 'text': structure drawn from the text index (lines, headings, figures),
		 * - 'spine': coloured section bands with labels (needs Paper.Root),
		 * - 'heatmap': no pages, only markers / Minimap.Heatmap.
		 * Default 'pages'.
		 */
		variant?: MinimapVariant;
		/** Draw page boxes at all. Default true (false = markers-only scrollbar). */
		pages?: boolean;
		/** Wheel over the strip scrolls the document (default) or the strip itself. */
		wheel?: 'document' | 'strip';
		/** Below this page height (px) bitmap previews become blocks. Default 36. */
		minPreviewHeight?: number;
		minimap?: MinimapState;
	},
	{ minimap: MinimapState }
>;
export type MinimapViewportProps = DivPartProps<Record<never, never>, { dragging: boolean }>;

export interface MinimapMarker {
	page: number;
	/** PDF y (top of the marked thing). */
	y?: number;
	/** Or a fraction from the top of the page. */
	fraction?: number;
	/** Height in PDF points (default: a thin line). */
	height?: number;
	color?: string;
	kind?: string;
	label?: string;
}
export type MinimapMarkersProps = DivPartProps<{
	items?: MinimapMarker[];
	/** Add find matches (needs Find.Root). */
	find?: boolean;
	/** Add annotations (needs Annotations.Root). */
	annotations?: boolean;
	/** Add section headings (needs Paper.Root). */
	sections?: boolean;
}>;
export type MinimapHeatmapProps = DivPartProps<{
	/** Bin height in px. Default 6. */
	bin?: number;
	find?: boolean;
	annotations?: boolean;
	items?: MinimapMarker[];
	/** CSS colour of the hottest bin. */
	color?: string;
}>;
