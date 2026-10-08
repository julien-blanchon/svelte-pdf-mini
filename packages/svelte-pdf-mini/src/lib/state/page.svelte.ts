import type { PageViewport, PDFPageProxy, TextLayer } from 'pdfjs-dist';
import { untrack } from 'svelte';
import { createAttachmentKey } from 'svelte/attachments';
import { loadPdfJs } from '../core/document/pdfjs.js';
import { releaseCanvas, renderPageToCanvas } from '../core/document/render.js';
import {
	bitmapKey,
	canvasFromBitmap,
	pageBitmapCache,
	storeCanvas
} from '../core/cache/bitmaps.js';
import { isCancel } from '../core/document/scheduler.js';
import type { PageSize } from '../core/types.js';
import { dataAttr, type Getter } from '../internal/types.js';
import { steerSelection } from './text-selection.js';
import type { ViewerState } from './viewer.svelte.js';

/** Per-page derived state shared by a page's layers. */
export class PageState {
	readonly viewer: ViewerState;
	readonly isNear: boolean;
	readonly isVisible: boolean;
	readonly isCurrent: boolean;
	readonly size: PageSize;
	/** Wide enough for per-page detail (text layer, page text index). See `ViewerOptions.detailMinWidth`. */
	readonly detailed: boolean;
	readonly props: ReturnType<ViewerState['getPageProps']>;
	/** The pdf.js page, loaded once the page is near the view. */
	pdfPage = $state.raw<PDFPageProxy | null>(null);
	/**
	 * Viewport at scale 1 with the view rotation. Overlays use it as an SVG
	 * viewBox (`0 0 width height`), so they scale with zoom for free.
	 */
	readonly viewport: PageViewport | null;
	#pageNumber: Getter<number>;
	#loadedFrom: unknown = null;

	constructor(viewer: ViewerState, pageNumber: Getter<number>) {
		this.viewer = viewer;
		this.#pageNumber = pageNumber;
		this.isNear = $derived(viewer.nearPages.has(this.pageNumber));
		this.isVisible = $derived(viewer.visiblePages.has(this.pageNumber));
		this.isCurrent = $derived(viewer.page === this.pageNumber);
		this.size = $derived(viewer.pageCssSize(this.pageNumber));
		this.props = $derived(viewer.getPageProps(this.pageNumber));
		this.detailed = $derived(this.size.width >= viewer.detailMinWidth);
		this.viewport = $derived(
			this.pdfPage
				? this.pdfPage.getViewport({
						scale: 1,
						rotation: (this.pdfPage.rotate + viewer.rotation) % 360
					})
				: null
		);
		$effect(() => {
			const doc = viewer.document.proxy;
			const n = this.pageNumber;
			if (!doc || !this.isNear) return;
			if (this.#loadedFrom === doc && untrack(() => this.pdfPage)?.pageNumber === n) return;
			let alive = true;
			viewer.document.getPage(n).then(
				(p) => {
					if (!alive) return;
					this.#loadedFrom = doc;
					this.pdfPage = p;
				},
				() => {}
			);
			return () => {
				alive = false;
			};
		});
		// Index the page text when it comes near (selection, search, annotations need it).
		$effect(() => {
			if (this.isNear && this.detailed && viewer.document.proxy)
				viewer.document.getPageText(this.pageNumber).catch(() => {});
		});
	}

	get pageNumber() {
		return this.#pageNumber();
	}

	get snippetProps() {
		return {
			pageNumber: this.pageNumber,
			width: this.size.width,
			height: this.size.height,
			isNear: this.isNear,
			isVisible: this.isVisible,
			isCurrent: this.isCurrent,
			scale: this.viewer.scale
		};
	}
}

/**
 * Renders the page bitmap into its container, double-buffered: the previous
 * bitmap stays (stretched) until the new render completes.
 * Must be constructed during component initialization.
 */
export class PageCanvasState {
	readonly page: PageState;
	el = $state.raw<HTMLElement | null>(null);
	/** True once a bitmap for the current scale/theme is on screen. */
	rendered = $state(false);
	/** True while any bitmap (maybe stale) is on screen. */
	hasBitmap = $state(false);
	#canvas: HTMLCanvasElement | null = null;
	/** Scale (CSS px per pt) the current bitmap was rendered at. */
	#bitmapScale = 1;
	#job = 0;
	#cacheKey = '';
	#progressive = false;
	/** The page pinned in the document while near (its pdf.js resources stay). */
	#pinned = 0;
	#key = createAttachmentKey();
	#attach = (node: HTMLElement) => {
		this.el = node;
		return () => {
			if (this.el === node) this.el = null;
		};
	};

	constructor(page: PageState) {
		this.page = page;
		const viewer = page.viewer;

		$effect(() => {
			const el = this.el;
			const doc = viewer.document.proxy;
			const near = page.isNear;
			const n = page.pageNumber;
			// As seen (a transform zoom shows a zoom the pages aren't laid out at yet).
			const scale = viewer.visualScale;
			const rotation = viewer.rotation;
			// Only themes drawn into the bitmap re-render: CSS ones (tint, filter) are applied below.
			void viewer.renderThemeId;
			const theme = untrack(() => viewer.pageTheme);
			const maxPixels = viewer.maxCanvasPixels;
			const annotationMode = viewer.hideNativeAnnotations ? 0 : 1;
			if (!el || !doc) return;
			if (!near) {
				this.#release();
				return;
			}
			if (this.#pinned !== n) {
				if (this.#pinned) viewer.document.unpinPage(this.#pinned);
				viewer.document.pinPage(n);
				this.#pinned = n;
			}
			// Render strategies (pageColors / wrapContext / postProcess) are part of the bitmap; CSS ones are not.
			const renderTheme =
				theme.pageColors || theme.wrapContext || theme.postProcess ? theme : { id: 'none' };
			// Oversample when zoomed out, so zooming back in stays sharp until the re-render lands.
			const renderScale = scale * oversample(viewer.zoom, viewer.oversampling);
			this.#cacheKey = bitmapKey(
				viewer.document.fingerprint ?? '',
				n,
				rotation,
				renderTheme.id,
				annotationMode
			);
			// Coming back to a page: show its cached bitmap at once; skip the render if it is sharp enough.
			if (!untrack(() => this.hasBitmap)) {
				const cached = pageBitmapCache().get(this.#cacheKey);
				if (cached) {
					this.#swap(el, canvasFromBitmap(cached.bitmap));
					this.#bitmapScale = cached.scale;
					if (Math.abs(cached.scale / renderScale - 1) < 0.05) {
						this.rendered = true;
						return;
					}
				}
			}
			const render = (job: number, signal: AbortSignal) =>
				viewer.document.getPage(n).then(async (pdfPage) => {
					if (signal.aborted) return;
					try {
						const canvas = await renderPageToCanvas({
							page: pdfPage,
							scale: renderScale,
							rotation,
							theme: renderTheme,
							maxCanvasPixels: maxPixels,
							signal,
							annotationMode
						});
						// A newer render (or the final one) superseded this job.
						if (signal.aborted || job !== this.#job) return releaseCanvas(canvas);
						this.#swap(el, canvas);
						this.#bitmapScale = renderScale;
						this.rendered = !viewer.isZooming;
					} catch (err) {
						if (!isCancel(err)) throw err;
					}
				});

			if (viewer.isZooming && untrack(() => this.hasBitmap)) {
				// While zooming: keep stretching the current bitmap, unless it is now
				// badly under-sampled; then refresh it once (without cancelling on every frame).
				const ratio = scale / this.#bitmapScale;
				if (ratio < 1.35 || this.#progressive) return;
				this.#progressive = true;
				const job = ++this.#job;
				viewer.scheduler.schedule({
					key: `canvas-progressive:${n}`,
					priority: untrack(() => (page.isVisible ? 0 : 2)),
					run: (signal) => render(job, signal).finally(() => (this.#progressive = false))
				});
				return;
			}
			this.rendered = false;
			const job = ++this.#job;
			return viewer.scheduler.schedule({
				key: `canvas:${n}`,
				priority: untrack(() => (page.isVisible ? 0 : 1)),
				run: (signal) => render(job, signal)
			});
		});

		// CSS-level theme (filter / blend) applies to the current bitmap instantly.
		$effect(() => {
			const theme = viewer.pageTheme;
			void this.hasBitmap;
			if (this.#canvas) applyBitmapTheme(this.#canvas, theme);
		});

		// Visible pages jump the queue.
		$effect(() => {
			if (page.isVisible) viewer.scheduler.reprioritize(`canvas:${page.pageNumber}`, 0);
		});

		$effect(() => () => this.#release());
	}

	get props() {
		const theme = this.page.viewer.pageTheme;
		return {
			'data-pdf-canvas': '',
			'data-rendered': dataAttr(this.rendered),
			'data-page-theme': theme.id.split('(')[0],
			'aria-hidden': 'true' as const,
			style:
				'position:absolute;inset:0;overflow:hidden;isolation:isolate;' +
				`background:${theme.background ?? 'var(--pdf-page-bg,#fff)'};`,
			[this.#key]: this.#attach
		} as const;
	}

	#swap(el: HTMLElement, canvas: HTMLCanvasElement) {
		const old = this.#canvas;
		// Always fill the page box: bitmaps come at any resolution (fresh renders,
		// oversampled ones, or snapshots restored from the bitmap cache).
		canvas.style.position = 'absolute';
		canvas.style.inset = '0';
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
		applyBitmapTheme(canvas, this.page.viewer.pageTheme);
		el.appendChild(canvas);
		if (old) releaseCanvas(old);
		this.#canvas = canvas;
		this.hasBitmap = true;
	}

	#release() {
		// A render still in flight (e.g. the progressive one) must not land on a released page.
		++this.#job;
		this.#progressive = false;
		// Keep a snapshot for an instant return (rendered bitmaps only).
		if (this.#canvas && this.rendered && this.#cacheKey)
			void storeCanvas(this.#cacheKey, this.#canvas, this.#bitmapScale).catch(() => {});
		if (this.#canvas) releaseCanvas(this.#canvas);
		this.#canvas = null;
		this.hasBitmap = false;
		this.rendered = false;
		if (this.#pinned) this.page.viewer.document.unpinPage(this.#pinned);
		this.#pinned = 0;
	}
}

/** Render resolution multiplier: up to ×2 when zoomed below 100%, never above 100% equivalent. */
function oversample(zoom: number, enabled: boolean) {
	if (!enabled || zoom >= 1) return 1;
	return Math.min(2, 1 / zoom);
}

function applyBitmapTheme(
	canvas: HTMLCanvasElement,
	theme: { filter?: string; blend?: string; dark?: boolean }
) {
	canvas.style.filter = theme.filter ?? '';
	// Blend over what's under the bitmap (page color, highlight underlay): on a
	// plain page this changes nothing; over a highlight it's a marker effect.
	canvas.style.mixBlendMode = theme.blend ?? (theme.dark ? 'lighten' : 'multiply');
}

/**
 * Selectable text layer (pdf.js `TextLayer`). Rebuilt only when the page
 * becomes near; zoom/rotation changes reuse it via `update()`.
 */
export class PageTextLayerState {
	readonly page: PageState;
	el = $state.raw<HTMLElement | null>(null);
	rendered = $state(false);
	#layer: TextLayer | null = null;
	#key = createAttachmentKey();
	// The `selecting` state and the end-of-content element are managed by
	// text-selection.ts once the layer is rendered (steerSelection below).
	#attach = (node: HTMLElement) => {
		this.el = node;
		return () => {
			if (this.el === node) this.el = null;
		};
	};

	constructor(page: PageState) {
		this.page = page;
		const viewer = page.viewer;

		$effect(() => {
			const el = this.el;
			const doc = viewer.document.proxy;
			const near = page.isNear;
			const n = page.pageNumber;
			// Level of detail: no selectable text on tiny pages (spreads zoomed far out).
			if (!el || !doc || !near || !page.detailed) return;
			let cancelled = false;
			let unsteer: (() => void) | undefined;
			(async () => {
				const [pdfjs, pdfPage, text] = await Promise.all([
					loadPdfJs(),
					viewer.document.getPage(n),
					viewer.document.getTextContent(n)
				]);
				if (cancelled) return;
				const viewport = pdfPage.getViewport({
					scale: viewer.scale,
					rotation: (pdfPage.rotate + viewer.rotation) % 360
				});
				const layer = new pdfjs.TextLayer({ textContentSource: text, container: el, viewport });
				this.#layer = layer;
				await layer.render();
				if (cancelled) return;
				// Span i ↔ text item i: lets DOM selections map back to the text index.
				layer.textDivs.forEach((div, i) => (div.dataset.idx = String(i)));
				// Selection sentinel (see text-selection.ts): keeps drags over gaps between
				// lines from jumping to the page's start or end in WebKit.
				const end = document.createElement('div');
				end.className = 'endOfContent';
				el.append(end);
				unsteer = steerSelection(el, end);
				this.rendered = true;
			})().catch((err) => {
				if (!cancelled && !isCancel(err)) console.error('[svelte-pdf-mini] text layer', err);
			});
			return () => {
				cancelled = true;
				unsteer?.();
				this.#layer?.cancel();
				this.#layer = null;
				el.replaceChildren();
				this.rendered = false;
			};
		});

		// Text follows --pdf-scale through CSS while zooming; re-measure once it settles.
		$effect(() => {
			const scale = viewer.scale;
			const rotation = viewer.rotation;
			const layer = this.#layer;
			if (!layer || !this.rendered || viewer.isZooming) return;
			viewer.document.getPage(page.pageNumber).then((pdfPage) => {
				if (this.#layer !== layer) return;
				layer.update({
					viewport: pdfPage.getViewport({ scale, rotation: (pdfPage.rotate + rotation) % 360 })
				});
			});
		});
	}

	get props() {
		return {
			class: 'textLayer',
			'data-pdf-text-layer': '',
			'data-rendered': dataAttr(this.rendered),
			// Off-screen layers skip style/layout; while zooming, thousands of spans would
			// otherwise recompute their font size every frame.
			style: `content-visibility:auto;${this.page.viewer.isZooming ? 'visibility:hidden;' : ''}`,
			[this.#key]: this.#attach
		} as const;
	}
}
