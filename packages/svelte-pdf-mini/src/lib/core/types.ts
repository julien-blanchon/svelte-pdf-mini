import type { PDFDocumentProxy } from 'pdfjs-dist';

export type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';

/** Anything `PdfDocument` can load. */
export type PdfSource =
	| string
	| URL
	| ArrayBuffer
	| Uint8Array
	| Blob
	| PDFDocumentProxy
	| { url: string | URL; httpHeaders?: Record<string, string>; withCredentials?: boolean };

export type DocumentStatus = 'idle' | 'loading' | 'password' | 'ready' | 'error';

/** Rect in PDF user space: [x1, y1, x2, y2], origin bottom-left, unrotated. */
export type PdfRect = [number, number, number, number];
/** Point in PDF user space. */
export type PdfPoint = [number, number];

/** Page size in PDF points, already including the page's intrinsic /Rotate. */
export interface PageSize {
	width: number;
	height: number;
	/** The page's box in PDF space (`[x1, y1, x2, y2]`), when measured. */
	viewBox?: [number, number, number, number];
	/** The page's own `/Rotate` (degrees), when measured. */
	rotate?: number;
}

export type ZoomMode = 'manual' | 'page-width' | 'page-height' | 'page-fit' | 'auto';
export type ScrollMode = 'vertical' | 'horizontal' | 'wrapped' | 'page';
export type Rotation = 0 | 90 | 180 | 270;
export type Align = 'start' | 'center' | 'end' | 'nearest';
/** Pages per row: a fixed count or 'auto' (as many as fit at the current zoom). */
export type Columns = number | 'auto';
/** Built-in focus effects; any other string is passed through as `data-highlight` for custom CSS. */
export type FocusHighlight = 'pulse' | 'outline' | 'spotlight' | (string & {});

/** Everything `focus()` / `goTo()` can target. Pages are 1-based. */
export type FocusTarget =
	{ page: number; rect?: PdfRect; point?: PdfPoint } | { dest: string | unknown[] };

export interface FocusOptions {
	align?: Align;
	behavior?: ScrollBehavior;
	/** Visual effect on the target. Default 'pulse' when a rect is given, otherwise false. */
	highlight?: FocusHighlight | false;
	/** How long the highlight stays (ms). Defaults to the viewer's `focusDuration` (1800). */
	duration?: number;
	/**
	 * Grow the target rect by this many PDF points on each side (or [x, y]), so the
	 * highlight comfortably includes the region. Defaults to the viewer's `focusPadding` (6).
	 */
	padding?: number | [number, number];
	/** Extra px between the target and the viewport edge. Default 16. */
	offset?: number;
}

/** A resolved, renderable focus region in CSS-fraction page coordinates (0..1). */
export interface FocusRegion {
	page: number;
	left: number;
	top: number;
	width: number;
	height: number;
	highlight: FocusHighlight;
	duration: number;
	key: number;
}
