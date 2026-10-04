import type { Attachment } from 'svelte/attachments';
import type { DivPartProps, ButtonPartProps } from '../../internal/component-types.js';

/** Spread on the element that receives the rendered page canvas. */
export interface ThumbnailCanvasProps {
	'data-pdf-thumbnail-canvas': '';
	[attachment: symbol]: Attachment<HTMLElement>;
}

export type ThumbnailsRootProps = DivPartProps<{
	/** Thumbnail width in CSS px. Default 120. */
	width?: number;
	/** Keep the current page's thumbnail scrolled into view. Default true. */
	followCurrent?: boolean;
}>;
export type ThumbnailsItemProps = ButtonPartProps<
	{ pageNumber: number },
	{
		pageNumber: number;
		label: string;
		isCurrent: boolean;
		rendered: boolean;
		/** Only given to `child`: spread it on your canvas host. */
		canvasProps?: ThumbnailCanvasProps;
	}
>;
