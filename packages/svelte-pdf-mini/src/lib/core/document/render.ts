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

	let ctx = canvas.getContext('2d', { alpha: false })!;
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
}): Promise<HTMLCanvasElement> {
	const { page, rect, cssWidth } = opts;
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
	const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport });
	const onAbort = () => task.cancel();
	opts.signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await task.promise;
	} catch (err) {
		releaseCanvas(canvas);
		throw err;
	} finally {
		opts.signal?.removeEventListener('abort', onAbort);
	}
	return canvas;
}
