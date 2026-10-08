import type { PDFPageProxy } from 'pdfjs-dist';
import type { PageThemeStrategy } from '../view/theme.js';
import type { Rotation } from '../types.js';
import { capOutputScale } from '../view/zoom.js';

export interface RenderPageOptions {
	page: PDFPageProxy;
	/** CSS px per PDF point (zoom × 96/72). */
	scale: number;
	rotation: Rotation;
	theme: PageThemeStrategy;
	maxCanvasPixels: number;
	signal: AbortSignal;
	/** pdf.js annotation mode: 0 disable, 1 enable (default), 2 forms, 3 storage. */
	annotationMode?: number;
}

/**
 * WebKitGTK (Linux: Epiphany, Tauri) composites GPU canvases on their own
 * layer and ignores their `mix-blend-mode` there: a page bitmap blended over
 * the highlight underlay (or the theme's page color) paints opaque instead.
 * A canvas that reads back often stays in software and is painted with the
 * page, where blending works. Chromium and Safari blend GPU canvases fine.
 */
const softwareCanvas =
	typeof navigator !== 'undefined' &&
	/AppleWebKit/.test(navigator.userAgent) &&
	/Linux|X11/.test(navigator.userAgent) &&
	!/Chrom(e|ium)|Android/.test(navigator.userAgent);

/** The 2D context of a canvas that may be blended over the page (see `softwareCanvas`). */
export function blendableContext(
	canvas: HTMLCanvasElement,
	opts: CanvasRenderingContext2DSettings = {}
) {
	return canvas.getContext('2d', softwareCanvas ? { ...opts, willReadFrequently: true } : opts);
}

/**
 * Render a page into a *new* canvas (double-buffering: the caller swaps it in
 * once complete, so the old bitmap stays visible while re-rendering).
 */
export async function renderPageToCanvas(opts: RenderPageOptions): Promise<HTMLCanvasElement> {
	const { page, scale, rotation, theme, maxCanvasPixels, signal } = opts;
	const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
	const dpr = globalThis.devicePixelRatio || 1;
	const outputScale = capOutputScale(viewport.width, viewport.height, dpr, maxCanvasPixels);

	const canvas = document.createElement('canvas');
	canvas.width = Math.floor(viewport.width * outputScale);
	canvas.height = Math.floor(viewport.height * outputScale);
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.setAttribute('aria-hidden', 'true');

	let ctx = blendableContext(canvas, { alpha: false })!;
	if (theme.wrapContext) ctx = theme.wrapContext(ctx);

	const task = page.render({
		// pdf.js ignores `canvasContext` when `canvas` is set: pass only the (wrapped) context then.
		canvas: theme.wrapContext ? null : canvas,
		canvasContext: ctx,
		viewport,
		transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
		annotationMode: opts.annotationMode ?? 1,
		pageColors: theme.pageColors
	});
	const onAbort = () => task.cancel();
	signal.addEventListener('abort', onAbort, { once: true });
	try {
		await task.promise;
		if (theme.postProcess && !signal.aborted) {
			await theme.postProcess(canvas.getContext('2d')!, { page, viewport, outputScale });
		}
	} catch (err) {
		// Cancelled or failed: the caller never gets the canvas, so free it here.
		releaseCanvas(canvas);
		throw err;
	} finally {
		signal.removeEventListener('abort', onAbort);
	}
	return canvas;
}

/** Free a canvas' backing store right away (Safari keeps it otherwise). */
export function releaseCanvas(canvas: HTMLCanvasElement) {
	canvas.width = 0;
	canvas.height = 0;
	canvas.remove();
}

/**
 * Render a region of a page (PDF-space rect) into a new canvas `cssWidth` wide.
 * Used for link / citation / figure previews.
 */
export async function renderRegionToCanvas(opts: {
	page: PDFPageProxy;
	rect: [number, number, number, number];
	cssWidth: number;
	signal?: AbortSignal;
	/** The reading theme (night recoloring, tint), as the pages get it. */
	theme?: PageThemeStrategy;
}): Promise<HTMLCanvasElement> {
	const { page, rect, cssWidth, theme } = opts;
	const base = page.getViewport({ scale: 1 });
	const [ax, ay] = base.convertToViewportPoint(rect[0], rect[3]);
	const [bx, by] = base.convertToViewportPoint(rect[2], rect[1]);
	const w = Math.max(1, Math.abs(bx - ax));
	const h = Math.max(1, Math.abs(by - ay));
	const dpr = globalThis.devicePixelRatio || 1;
	const scale = (cssWidth / w) * dpr;
	const viewport = page.getViewport({
		scale,
		offsetX: -Math.min(ax, bx) * scale,
		offsetY: -Math.min(ay, by) * scale
	});
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(w * scale);
	canvas.height = Math.round(h * scale);
	canvas.style.width = `${cssWidth}px`;
	canvas.style.height = `${(h / w) * cssWidth}px`;
	opts.signal?.throwIfAborted();
	let ctx = blendableContext(canvas, { alpha: false })!;
	if (theme?.wrapContext) ctx = theme.wrapContext(ctx);
	const task = page.render({
		// pdf.js ignores `canvasContext` when `canvas` is set: pass only the (wrapped) context then.
		canvas: theme?.wrapContext ? null : canvas,
		canvasContext: ctx,
		viewport,
		pageColors: theme?.pageColors
	});
	const onAbort = () => task.cancel();
	opts.signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await task.promise;
		if (theme?.postProcess && !opts.signal?.aborted)
			await theme.postProcess(canvas.getContext('2d')!, { page, viewport, outputScale: 1 });
		// The same look as the pages: filter, and blend over the theme's page color (set it
		// behind the canvas, e.g. on its host).
		canvas.style.filter = theme?.filter ?? '';
		if (theme?.blend) canvas.style.mixBlendMode = theme.blend;
	} catch (err) {
		releaseCanvas(canvas);
		throw err;
	} finally {
		opts.signal?.removeEventListener('abort', onAbort);
	}
	return canvas;
}
