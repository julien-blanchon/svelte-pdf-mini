import { canvasFromBitmap } from '../core/cache/bitmaps.js';
import { LruCache } from '../core/cache/lru.js';
import { renderPageToCanvas } from '../core/document/render.js';
import { RenderScheduler } from '../core/document/scheduler.js';
import type { PdfDocument } from './document.svelte.js';

/**
 * Low-resolution page bitmaps shared by every thumbnail list / minimap of a
 * document. Rendered lazily with their own low-priority scheduler, kept in a
 * bounded LRU (bitmaps are closed on eviction).
 *
 * Consumers get a fresh canvas copy each time (`canvas()`): a cached
 * ImageBitmap must never be transferred (`transferFromImageBitmap` would
 * neuter it and later mounts would draw nothing).
 */
export class ThumbnailCache {
	readonly #doc: PdfDocument;
	readonly #scheduler = new RenderScheduler(1);
	readonly #bitmaps = new LruCache<string, ImageBitmap>(64 * 1024 * 1024, (b) => b.close());
	readonly #pending = new Map<string, Promise<ImageBitmap>>();
	#fingerprint: string | null = null;

	constructor(doc: PdfDocument) {
		this.#doc = doc;
	}

	/** Bitmap of a page at a CSS width (device pixels handled internally). Do not transfer or close it. */
	get(pageNumber: number, cssWidth: number, priority = 5): Promise<ImageBitmap> {
		const dpr = globalThis.devicePixelRatio || 1;
		// Another document in the same viewer: the old bitmaps and renders are of no use.
		if (this.#fingerprint !== this.#doc.fingerprint) {
			this.clear();
			this.#fingerprint = this.#doc.fingerprint;
		}
		const key = `${this.#doc.fingerprint}:${pageNumber}:${Math.round(cssWidth * dpr)}`;
		const hit = this.#bitmaps.get(key);
		if (hit) return Promise.resolve(hit);
		let p = this.#pending.get(key);
		if (!p) {
			p = new Promise<ImageBitmap>((resolve, reject) => {
				this.#scheduler.schedule({
					key,
					priority,
					onCancel: () => {
						this.#pending.delete(key);
						reject(new DOMException('Thumbnail cancelled', 'AbortError'));
					},
					run: async (signal) => {
						try {
							const page = await this.#doc.getPage(pageNumber);
							const size = page.getViewport({ scale: 1 });
							const canvas = await renderPageToCanvas({
								page,
								scale: cssWidth / size.width,
								rotation: 0,
								theme: { id: 'none' },
								maxCanvasPixels: 4_000_000,
								signal,
								annotationMode: 1
							});
							const bitmap = await createImageBitmap(canvas);
							canvas.width = canvas.height = 0;
							// Drawn small once: free the page's decoded images (unless the viewer shows it).
							this.#doc.releasePage(pageNumber);
							this.#bitmaps.set(key, bitmap, bitmap.width * bitmap.height * 4);
							resolve(bitmap);
						} catch (e) {
							reject(e);
						} finally {
							this.#pending.delete(key);
						}
					}
				});
			});
			this.#pending.set(key, p);
		}
		return p;
	}

	/** A new canvas showing the page (safe to insert into the DOM). */
	async canvas(pageNumber: number, cssWidth: number, priority = 5): Promise<HTMLCanvasElement> {
		const canvas = canvasFromBitmap(await this.get(pageNumber, cssWidth, priority));
		canvas.style.cssText = 'display:block;width:100%;height:100%';
		return canvas;
	}

	/** Change the memory budget (bytes). */
	set budget(bytes: number) {
		this.#bitmaps.resize(bytes);
	}

	clear() {
		this.#scheduler.clear();
		this.#bitmaps.clear();
		this.#pending.clear();
	}
}

const caches = new WeakMap<PdfDocument, ThumbnailCache>();

export function thumbnailCache(doc: PdfDocument): ThumbnailCache {
	let c = caches.get(doc);
	if (!c) caches.set(doc, (c = new ThumbnailCache(doc)));
	return c;
}
