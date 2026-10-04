import type { PdfRect } from '../types.js';

/** What a region extraction returns. */
export interface RegionExtraction {
	/** Markdown (a GitHub table for tables, paragraphs otherwise). */
	markdown: string;
	/** Optional HTML (`<table>` / `<p>`). */
	html?: string;
	/** Table cells when the region was recognised as a table (rows × columns). */
	cells?: string[][];
	/** Which extractor produced it. */
	source: string;
}

export interface RegionRequest {
	/** 1-based page. */
	page: number;
	/** PDF-space rect. */
	rect: PdfRect;
	/** Hint: what the region is. */
	kind?: 'table' | 'figure' | 'text';
}

/**
 * Turns a page region into Markdown / HTML / cells. Implementations: the
 * built-in `layoutExtractor` (from the text index, no dependencies) and
 * adapters such as `pdfOxideExtractor` (WASM).
 */
export interface RegionExtractor {
	id: string;
	extract(req: RegionRequest, opts?: { signal?: AbortSignal }): Promise<RegionExtraction | null>;
}
