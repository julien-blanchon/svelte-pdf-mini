import { clamp, pdfYToFraction } from '../core/view/geometry.js';
import { rotatedSize } from '../core/view/zoom.js';
import type { ViewerState, ViewLocation } from './viewer.svelte.js';

export type MinimapVariant = 'pages' | 'blocks' | 'text' | 'spine' | 'heatmap';

export interface MinimapOptions {
	viewer: ViewerState;
	/** Strip width in CSS px. Default 80. */
	width?: () => number | undefined;
	/** Gap between pages in the strip (px). Default 4. */
	gap?: () => number | undefined;
	/**
	 * 'scroll': pages keep the strip width and the strip scrolls in proportion
	 * with the document (code-editor style). 'fit': the whole document is shrunk
	 * to fit the strip height. Default 'scroll'.
	 */
	mode?: () => 'scroll' | 'fit' | undefined;
	/** What the wheel does over the strip: scroll the document (default) or scroll the strip itself. */
	wheel?: () => 'document' | 'strip' | undefined;
	/** Below this page height (px) bitmap previews are replaced by plain blocks. Default 36. */
	minPreviewHeight?: () => number | undefined;
}

export interface MinimapPage {
	page: number;
	top: number;
	height: number;
	width: number;
	left: number;
}

/**
 * Geometry of a document minimap: page boxes in strip coordinates, the
 * strip's scroll offset (automatic, or free when the user scrolls the strip),
 * the viewport indicator, conversions both ways, and keyboard/wheel actions.
 */
export class MinimapState {
	readonly viewer: ViewerState;
	/** Height of the strip element (measured). */
	height = $state(0);
	/** Strip offset chosen by the user (wheel in 'strip' mode); null = follow the document. */
	manualOffset = $state<number | null>(null);
	#opts: MinimapOptions;

	readonly width = $derived(this.#opt('width') ?? 80);
	readonly gap = $derived(this.#opt('gap') ?? 4);
	readonly mode = $derived(this.#opt('mode') ?? 'scroll');
	readonly wheelMode = $derived(this.#opt('wheel') ?? 'document');
	readonly minPreviewHeight = $derived(this.#opt('minPreviewHeight') ?? 36);

	/** Pages laid out at full strip width. */
	readonly #natural = $derived.by(() => {
		const doc = this.viewer.document;
		const out: MinimapPage[] = [];
		let y = 0;
		for (let n = 1; n <= doc.numPages; n++) {
			const s = rotatedSize(doc.pageSize(n), this.viewer.rotation);
			const h = (s.height / s.width) * this.width;
			out.push({ page: n, top: y, height: h, width: this.width, left: 0 });
			y += h + this.gap;
		}
		return { pages: out, total: Math.max(0, y - this.gap) };
	});

	/** Shrink factor in 'fit' mode (1 otherwise). */
	readonly fitScale = $derived(
		this.mode === 'fit' && this.height > 0 && this.#natural.total > this.height
			? this.height / this.#natural.total
			: 1
	);
	readonly pages: MinimapPage[] = $derived(
		this.#natural.pages.map((p) => {
			const k = this.fitScale;
			const w = p.width * k;
			return {
				page: p.page,
				top: p.top * k,
				height: p.height * k,
				width: w,
				left: (this.width - w) / 2
			};
		})
	);
	readonly total = $derived(this.#natural.total * this.fitScale);
	/** Typical page height in the strip (px). */
	readonly pageHeight = $derived(
		this.pages.length ? this.pages.reduce((s, p) => s + p.height, 0) / this.pages.length : 0
	);
	/** Are pages big enough for bitmap previews to be readable? */
	readonly previewsUseful = $derived(this.pageHeight >= this.minPreviewHeight);
	/** Can the strip scroll (document taller than the strip)? */
	readonly scrollable = $derived(this.total > this.height + 1);

	/** Automatic offset: the strip scrolls so the viewport indicator travels the whole height. */
	readonly #autoOffset = $derived.by(() => {
		const overflow = this.total - this.height;
		if (overflow <= 0) return 0;
		return overflow * this.#progress(this.viewer.viewRange.start, this.viewer.viewRange.end);
	});
	readonly offset = $derived(
		this.manualOffset == null
			? this.#autoOffset
			: clamp(this.manualOffset, 0, Math.max(0, this.total - this.height))
	);

	/** Viewport indicator box (strip coordinates, before `offset`). */
	readonly indicator = $derived.by(() => {
		const { start, end } = this.viewer.viewRange;
		const top = this.yOf(start);
		const bottom = this.yOf(end);
		return { top, height: Math.max(4, bottom - top) };
	});

	constructor(opts: MinimapOptions) {
		this.#opts = opts;
		this.viewer = opts.viewer;
		// A free (manual) strip position snaps back once the viewport indicator leaves it.
		$effect(() => {
			const m = this.manualOffset;
			if (m == null) return;
			const { top, height } = this.indicator;
			if (top + height < m || top > m + this.height) this.manualOffset = null;
		});
	}

	#opt<K extends Exclude<keyof MinimapOptions, 'viewer'>>(
		key: K
	): ReturnType<NonNullable<MinimapOptions[K]>> | undefined {
		const getter = this.#opts[key] as
			(() => ReturnType<NonNullable<MinimapOptions[K]>>) | undefined;
		return getter?.();
	}

	/** Strip y (before offset) of a document location. */
	yOf(loc: ViewLocation): number {
		const p = this.pages[clamp(loc.page, 1, this.pages.length) - 1];
		return p ? p.top + clamp(loc.fraction, 0, 1) * p.height : 0;
	}

	/** Strip y of a PDF-space point on a page. */
	yOfPoint(page: number, pdfY: number): number {
		const size = this.viewer.document.pageSize(page);
		const fraction = pdfYToFraction(size, pdfY, this.viewer.rotation);
		return this.yOf({ page, fraction: fraction ?? 0 });
	}

	/** Document location at a strip y (before offset). */
	locationAt(y: number): ViewLocation {
		const pages = this.pages;
		for (const p of pages)
			if (y <= p.top + p.height)
				return { page: p.page, fraction: clamp((y - p.top) / p.height, 0, 1) };
		const last = pages[pages.length - 1];
		return { page: last?.page ?? 1, fraction: 1 };
	}

	/** Scroll the viewer so strip y lands in the middle of the view. */
	scrollTo(y: number, behavior: ScrollBehavior = 'instant') {
		this.manualOffset = null;
		this.viewer.scrollToLocation(this.locationAt(y), { align: 'center', behavior });
	}

	/** Wheel over the strip: scroll the document (default) or the strip itself. */
	wheel(deltaY: number) {
		if (this.wheelMode === 'strip' && this.scrollable) {
			this.manualOffset = clamp(
				(this.manualOffset ?? this.offset) + deltaY,
				0,
				this.total - this.height
			);
		} else {
			this.viewer.scrollEl?.scrollBy({ top: deltaY });
		}
	}

	/** Keyboard (role=scrollbar): line / page / start / end steps of the document. */
	step(kind: 'line' | 'page' | 'start' | 'end', direction: 1 | -1 = 1) {
		const el = this.viewer.scrollEl;
		if (!el) return;
		if (kind === 'start') return el.scrollTo({ top: 0 });
		if (kind === 'end') return el.scrollTo({ top: el.scrollHeight });
		el.scrollBy({ top: direction * el.clientHeight * (kind === 'page' ? 0.9 : 0.1) });
	}

	/** Scroll progress 0..1 of the viewer (top of view at 0, bottom of document at 1). */
	#progress(start: ViewLocation, end: ViewLocation) {
		const top = this.yOf(start);
		const bottom = this.yOf(end);
		const viewH = bottom - top;
		const range = this.total - viewH;
		return range > 0 ? clamp(top / range, 0, 1) : 0;
	}
}
