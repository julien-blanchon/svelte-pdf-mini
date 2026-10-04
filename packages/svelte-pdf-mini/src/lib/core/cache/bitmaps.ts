/**
 * Page bitmaps kept after a page scrolls out of range, so coming back is
 * instant (then refined if the zoom changed). Bounded by a byte budget shared
 * by every viewer; evicted bitmaps are `close()`d.
 */
import { getPdfConfig } from '../document/pdfjs.js';
import { LruCache } from './lru.js';

export interface CachedBitmap {
	bitmap: ImageBitmap;
	/** CSS px per PDF point the bitmap was rendered at. */
	scale: number;
}

let cache: LruCache<string, CachedBitmap> | null = null;

/** The shared page-bitmap cache (budget: `configurePdf({ bitmapCacheBytes })`, default 192 MB). */
export function pageBitmapCache(): LruCache<string, CachedBitmap> {
	cache ??= new LruCache<string, CachedBitmap>(
		getPdfConfig().bitmapCacheBytes ?? 192 * 1024 * 1024,
		(v) => v.bitmap.close()
	);
	return cache;
}

/** Cache key for a page bitmap (scale is stored in the value, not the key). */
export function bitmapKey(
	fingerprint: string,
	page: number,
	rotation: number,
	themeId: string,
	annotationMode: number
) {
	return `${fingerprint}|${page}|${rotation}|${themeId}|${annotationMode}`;
}

/** Store a snapshot of a rendered canvas (the canvas can be released right after). */
export async function storeCanvas(key: string, canvas: HTMLCanvasElement, scale: number) {
	if (!canvas.width || !canvas.height || typeof createImageBitmap === 'undefined') return;
	const bitmap = await createImageBitmap(canvas);
	pageBitmapCache().set(key, { bitmap, scale }, bitmap.width * bitmap.height * 4);
}

/** A canvas showing a cached bitmap (a copy: the cached bitmap stays usable). */
export function canvasFromBitmap(bitmap: ImageBitmap): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
	return canvas;
}
