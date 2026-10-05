/**
 * Lazy, SSR-safe access to pdf.js plus global configuration.
 *
 * pdf.js touches DOM globals at import time, so it is only ever imported
 * dynamically from the browser.
 */
import type * as PdfJs from 'pdfjs-dist';
import {
	installStreamIteration,
	needsStreamIteration,
	workerWithStreamIteration
} from './stream-iteration.js';

export type PdfJsModule = typeof PdfJs;

export interface PdfConfig {
	/** URL of `pdf.worker.min.mjs`. Defaults to the copy bundled through Vite `?url`. */
	workerSrc?: string;
	/** A ready Worker to share (takes precedence over workerSrc). */
	workerPort?: Worker;
	/** Directory URLs (trailing slash). Default: jsDelivr for the installed pdfjs-dist version. */
	cMapUrl?: string;
	standardFontDataUrl?: string;
	wasmUrl?: string;
	iccUrl?: string;
	/** Extra options merged into every `getDocument()` call. */
	documentOptions?: Record<string, unknown>;
	/** Share one worker between documents. Default true. */
	sharedWorker?: boolean;
	/** Memory budget for page bitmaps kept after scrolling away (bytes). Default 192 MB; 0 disables. */
	bitmapCacheBytes?: number;
}

let config: PdfConfig = {};
let modulePromise: Promise<PdfJsModule> | null = null;
let sharedWorker: InstanceType<PdfJsModule['PDFWorker']> | null = null;

/** One pdf.js worker shared by every document (a library grid opens many). */
export async function getSharedWorker() {
	const pdfjs = await loadPdfJs();
	if (!sharedWorker || sharedWorker.destroyed) sharedWorker = createWorker(pdfjs);
	return sharedWorker;
}

/** A pdf.js worker on the configured `workerPort`, or a new one from `workerSrc`. */
export function createWorker(pdfjs: PdfJsModule): InstanceType<PdfJsModule['PDFWorker']> {
	return config.workerPort
		? pdfjs.PDFWorker.create({ port: config.workerPort })
		: new pdfjs.PDFWorker();
}

/** Configure pdf.js once, before the first document loads. */
export function configurePdf(next: PdfConfig): void {
	// The worker is set up on first load; later worker settings would be silently ignored.
	if (modulePromise && (next.workerSrc !== undefined || next.workerPort !== undefined))
		console.warn(
			'[svelte-pdf-mini] configurePdf: the worker is already set up; call it before the first document loads.'
		);
	config = { ...config, ...next };
}

export function getPdfConfig(): Readonly<PdfConfig> {
	return config;
}

/** Import pdf.js (once) and set up its worker. Browser only. */
export function loadPdfJs(): Promise<PdfJsModule> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('svelte-pdf-mini: pdf.js can only be loaded in the browser'));
	}
	modulePromise ??= (async () => {
		// WKWebView lacks ReadableStream async iteration, which pdf.js uses for
		// text content: shim it here and in the worker (see stream-iteration.ts).
		const shim = needsStreamIteration();
		installStreamIteration();
		const pdfjs = await import('pdfjs-dist');
		if (config.workerPort) {
			pdfjs.GlobalWorkerOptions.workerPort = config.workerPort;
		} else if (!pdfjs.GlobalWorkerOptions.workerSrc) {
			const src =
				config.workerSrc ?? (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = shim ? workerWithStreamIteration(src) : src;
		}
		return pdfjs;
	})();
	return modulePromise;
}

/** Asset directory URLs for the installed pdf.js version. */
export function assetUrls(version: string) {
	const cdn = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/`;
	return {
		cMapUrl: config.cMapUrl ?? `${cdn}cmaps/`,
		cMapPacked: true,
		standardFontDataUrl: config.standardFontDataUrl ?? `${cdn}standard_fonts/`,
		wasmUrl: config.wasmUrl ?? `${cdn}wasm/`,
		iccUrl: config.iccUrl ?? `${cdn}iccs/`
	};
}

/** CSS px per PDF point at 100% zoom (96 dpi / 72 dpi), same as Acrobat and pdf.js. */
export const PDF_TO_CSS = 96 / 72;
