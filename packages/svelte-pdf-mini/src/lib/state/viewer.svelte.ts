import { tick, untrack } from 'svelte';
import { createAttachmentKey } from 'svelte/attachments';
import { resolveDestination } from '../core/document/destinations.js';
import {
	clamp,
	distanceToRange,
	fractionToPdfY,
	pdfRectToViewport
} from '../core/view/geometry.js';
import { PDF_TO_CSS } from '../core/document/pdfjs.js';
import { RenderScheduler } from '../core/document/scheduler.js';
import { resolvePageTheme, type PageThemeInput } from '../core/view/theme.js';
import type {
	FocusHighlight,
	Columns,
	FocusOptions,
	FocusRegion,
	FocusTarget,
	PageSize,
	Rotation,
	ScrollMode,
	ZoomMode
} from '../core/types.js';
import {
	MAX_ZOOM,
	MIN_ZOOM,
	fitZoom,
	nextZoomStep,
	rotatedSize,
	ZOOM_STEPS
} from '../core/view/zoom.js';
import { Synced } from '../internal/synced.svelte.js';
import {
	dataAttr,
	readOption,
	type Getter,
	type MaybeGetter,
	type Resolved
} from '../internal/types.js';
import type { PdfDocument } from './document.svelte.js';
import { formatMessage, type MessageKey, type Messages } from '../core/i18n/messages.js';
import { TextSelectionState } from './selection.svelte.js';
import type { ContextResolver, PdfContext } from './pointer-context.js';
import type { LinkKind } from '../core/paper/types.js';
import { attachZoomGestures } from './viewer/gestures.js';
import { NavigationHistory, type ViewLocation } from './viewer/history.svelte.js';
import { alignScroll, prefersReducedMotion, scrollAndWait } from './viewer/scroll.js';
import { ZoomAnimator, type ClientPoint } from './viewer/zoom-animator.js';
import { defaultKeymap, matchAction, type Keymap } from '../core/i18n/keymap.js';

export type { ViewLocation } from './viewer/history.svelte.js';
export type { ClientPoint } from './viewer/zoom-animator.js';

/** A link the pointer is over (for previews). */
export interface HoveredLink {
	page: number;
	dest?: string | unknown[];
	url?: string;
	anchor: HTMLElement;
}

export interface ViewerOptions {
	document: PdfDocument;
	/** 1 = 100%. Getter → controlled. */
	zoom?: number | Getter<number>;
	onZoomChange?: (zoom: number) => void;
	zoomMode?: ZoomMode | Getter<ZoomMode>;
	onZoomModeChange?: (mode: ZoomMode) => void;
	/** Current page, 1-based. Setting it from outside scrolls to it. */
	page?: number | Getter<number>;
	onPageChange?: (page: number) => void;
	rotation?: Rotation | Getter<Rotation>;
	onRotationChange?: (rotation: Rotation) => void;
	scrollMode?: ScrollMode | Getter<ScrollMode>;
	onScrollModeChange?: (mode: ScrollMode) => void;
	/**
	 * Pages per row in vertical / page mode: 1–4, or 'auto' (as many as fit at
	 * the current zoom, up to `maxColumns`: zooming out goes 1 → 2 → 3 → 4).
	 */
	columns?: Columns | Getter<Columns>;
	onColumnsChange?: (columns: Columns) => void;
	/** Upper bound for 'auto' columns. Default 4. */
	maxColumns?: MaybeGetter<number | undefined>;
	/** Book layout: page 1 alone on the first row (cover), then spreads. */
	firstPageAlone?: MaybeGetter<boolean | undefined>;
	/** Page content theme strategy (dark mode, tint…). */
	pageTheme?: MaybeGetter<PageThemeInput | undefined>;
	/** Pages within this many viewport-lengths of the view are rendered. Default 1. */
	overscan?: MaybeGetter<number | undefined>;
	/** Max canvas area in device pixels. Default 16M. */
	maxCanvasPixels?: MaybeGetter<number | undefined>;
	/** Ctrl/⌘ + wheel and trackpad pinch zoom. Default true. */
	wheelZoom?: MaybeGetter<boolean | undefined>;
	/** Ease zoom changes (wheel, buttons, keys, fit modes, zoomTo). Default true (off with reduced motion). */
	smoothZoom?: MaybeGetter<boolean | undefined>;
	/**
	 * Zoom gestures (pinch, wheel, buttons) show as a CSS transform of the pages while they
	 * run, laid out and drawn again once at the end: no relayout per frame. Default true.
	 */
	transformZoom?: MaybeGetter<boolean | undefined>;
	/** Render zoomed-out pages at up to 2× so zooming in stays sharp. Default true. */
	oversampling?: MaybeGetter<boolean | undefined>;
	/**
	 * Level of detail: pages narrower than this (CSS px) skip their text layer and
	 * text indexing (thumbnail-sized spreads). Default 260.
	 */
	detailMinWidth?: MaybeGetter<number | undefined>;
	/** Zoom steps for zoomIn/zoomOut. */
	zoomSteps?: MaybeGetter<number[] | undefined>;
	/** Smallest zoom any way of zooming reaches (0.5 = 50%). Default 0.1. */
	minZoom?: MaybeGetter<number | undefined>;
	/** Largest zoom any way of zooming reaches (3 = 300%). Default 10. */
	maxZoom?: MaybeGetter<number | undefined>;
	/**
	 * Lock the zoom: pinch, wheel, shortcuts, `zoomTo` and zoom mode changes do nothing
	 * (gestures are still captured). A fit mode keeps fitting the view as it resizes.
	 */
	zoomLocked?: MaybeGetter<boolean | undefined>;
	/**
	 * Keyboard shortcuts: on the viewport (true, default), anywhere in the page
	 * except text fields and dialogs ('document': for apps with one viewer, so
	 * keys still work after clicking a toolbar button), or off (false).
	 */
	keyboard?: MaybeGetter<boolean | 'document' | undefined>;
	/** How long a focus highlight stays, in ms. Default 1800. */
	focusDuration?: MaybeGetter<number | undefined>;
	/** Default effect when a link (or `focus()` without `highlight`) lands on a region. Default 'pulse'. */
	focusHighlight?: MaybeGetter<FocusHighlight | undefined>;
	/** Padding (PDF points) added around focused rects. Default 6. */
	focusPadding?: MaybeGetter<number | [number, number] | undefined>;
	/** UI strings for this viewer (merged over `setMessages()` / the English defaults). */
	messages?: MaybeGetter<Partial<Messages> | undefined>;
	/** Keyboard shortcuts for this viewer (merged over `defaultKeymap`); also used by annotations. */
	keymap?: MaybeGetter<Partial<Keymap> | undefined>;
}

interface Anchor extends ClientPoint {
	page: number;
	fx: number;
	fy: number;
	/** Was scrolled to the very top: stays there. */
	pinTop?: boolean;
}

interface LayoutRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Renders wait until zoom has been still this long (ms). */
const ZOOM_SETTLE = 140;

/** Pages container layout per scroll mode (vertical with several columns is a grid). */
const CONTENT_LAYOUT = {
	horizontal:
		'display:flex;flex-direction:row;align-items:center;width:max-content;min-height:100%;',
	wrapped: 'display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;',
	column: 'display:flex;flex-direction:column;align-items:center;width:max-content;min-width:100%;'
};
const gridLayout = (cols: number) =>
	`display:grid;grid-template-columns:repeat(${cols},max-content);justify-content:center;align-items:start;width:max-content;min-width:100%;`;

function contentLayout(mode: ScrollMode, cols: number): string {
	if (mode === 'horizontal' || mode === 'wrapped') return CONTENT_LAYOUT[mode];
	return cols > 1 ? gridLayout(cols) : CONTENT_LAYOUT.column;
}

/** pdf.js layer variables, all driven by the one `--pdf-scale`. */
const PAGE_SCALE_VARS =
	'--scale-factor:var(--pdf-scale);--user-unit:1;--total-scale-factor:var(--pdf-scale);--scale-round-x:1px;--scale-round-y:1px;';

/**
 * Layout, zoom, navigation and visibility for one scrollable view of a document.
 * Must be constructed during component initialization.
 */
export class ViewerState {
	readonly scheduler = new RenderScheduler(2);

	#zoom: Synced<number>;
	#zoomMode: Synced<ZoomMode>;
	#page: Synced<number>;
	#rotation: Synced<Rotation>;
	#scrollMode: Synced<ScrollMode>;
	#columns: Synced<Columns>;
	#opts: ViewerOptions;

	/** The scroll container. */
	scrollEl = $state.raw<HTMLElement | null>(null);
	/** The element holding the pages. */
	contentEl = $state.raw<HTMLElement | null>(null);
	/** Inner size of the scroll container available to pages (CSS px). */
	available = $state.raw({ width: 0, height: 0 });
	/** Gap between pages (CSS px), read from `--pdf-page-gap`. */
	gap = $state(16);
	/**
	 * Room fit modes leave beside the pages for side content such as margin
	 * notes (CSS px), read from `--pdf-pages-aside`. It never moves the pages
	 * (they stay centered) and never adds a scrollbar: side content adapts to
	 * `sideRoom` instead.
	 */
	aside = $state(0);
	/** Horizontal padding of the pages container (total), measured. */
	#padX = $state(32);
	/** Pages close enough to the view to be rendered. */
	nearPages = $state.raw<ReadonlySet<number>>(new Set());
	/** Pages currently intersecting the view. */
	visiblePages = $state.raw<ReadonlySet<number>>(new Set());
	/** Current transient focus highlight. */
	focusRegion = $state.raw<FocusRegion | null>(null);
	/** True while zoom is changing (renders wait until it settles). */
	isZooming = $state(false);
	/**
	 * The reading point: the PDF-space position (page, y) a little below the top
	 * of the viewport. Updated on scroll; drives active outline items etc.
	 */
	readingPoint = $state.raw<{ page: number; y: number; fraction: number }>({
		page: 1,
		y: Infinity,
		fraction: 0
	});
	/**
	 * Don't let pdf.js paint the PDF's own annotations onto the page (set when
	 * an annotation layer shows imported annotations itself, to avoid doubles).
	 */
	hideNativeAnnotations = $state(false);
	/** The visible part of the document: from (page, fraction) to (page, fraction). Updated on scroll. */
	viewRange = $state.raw<{ start: ViewLocation; end: ViewLocation }>({
		start: { page: 1, fraction: 0 },
		end: { page: 1, fraction: 1 }
	});
	/** Context of the last right-click / context-menu key in the viewport (see `contextAt`). */
	lastContext = $state.raw<PdfContext | null>(null);
	/** Link anchors rendered by `Viewer.LinkLayer` → their link (for context resolution). */
	readonly linkElements = new WeakMap<Element, { url?: string; dest?: unknown; kind: LinkKind }>();
	#resolvers = new Set<ContextResolver>();
	/** Selection as it was when the right button went down (a right-click may collapse it). */
	#selectionAtRightClick: { ranges: PdfContext['selection']; text: string; at: number } | null =
		null;
	/** Link under the pointer (set by `Viewer.LinkLayer`). */
	hoveredLink = $state.raw<HoveredLink | null>(null);
	/** Back / forward stacks for in-document jumps. */
	readonly history = new NavigationHistory();
	/** Browser text selection mapped to the text index. */
	readonly selection: TextSelectionState;

	/** Zoom the pages are laid out and drawn at while a zoom gesture shows as a transform (else null). */
	#previewFrom = $state<number | null>(null);
	/** The transform showing that gesture: visual = translate(tx, ty) scale(k) of the laid-out pages. */
	#preview = $state.raw<{ k: number; tx: number; ty: number } | null>(null);
	/** Where the gesture last zoomed around (client coordinates). */
	#previewPoint: ClientPoint | null = null;
	/** The pages' extent in their container (laid out at the gesture's start) and its padding. */
	#previewBox: { left: number; right: number; top: number; bottom: number; pad: number } | null =
		null;
	/** An anchor computed for the next scale change (instead of measuring one). */
	#forcedAnchor: Anchor | null = null;
	readonly scale = $derived((this.#previewFrom ?? this.zoom) * PDF_TO_CSS);
	/**
	 * CSS px per PDF point as seen: `scale`, or during a transform zoom the zoom shown.
	 * Page bitmaps are drawn at this, so they stay sharp while the gesture runs and need
	 * no redraw when it lands.
	 */
	readonly visualScale = $derived(this.zoom * PDF_TO_CSS);
	readonly pageTheme = $derived(resolvePageTheme(this.#opt('pageTheme')));
	/** Id of the part of the theme drawn into page bitmaps ('none' for CSS-only themes). */
	readonly renderThemeId = $derived.by(() => {
		const t = this.pageTheme;
		return t.pageColors || t.wrapContext || t.postProcess ? t.id : 'none';
	});
	readonly overscan = $derived(this.#opt('overscan') ?? 1);
	readonly maxCanvasPixels = $derived(this.#opt('maxCanvasPixels') ?? 16_777_216);
	readonly zoomSteps = $derived(this.#opt('zoomSteps') ?? ZOOM_STEPS);
	/** Within the global limits; a `maxZoom` below `minZoom` is raised to it. */
	readonly minZoom = $derived(clamp(this.#opt('minZoom') ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM));
	readonly maxZoom = $derived(clamp(this.#opt('maxZoom') ?? MAX_ZOOM, this.minZoom, MAX_ZOOM));
	readonly zoomLocked = $derived(this.#opt('zoomLocked') ?? false);
	/** Where shortcuts are listened to (see the `keyboard` option). */
	readonly keyboard = $derived(this.#opt('keyboard') ?? true);
	/** Shortcuts in effect (defaults + overrides). */
	readonly keymap: Keymap = $derived({ ...defaultKeymap, ...(this.#opt('keymap') ?? {}) });
	readonly oversampling = $derived(this.#opt('oversampling') ?? true);
	readonly detailMinWidth = $derived(this.#opt('detailMinWidth') ?? 260);
	readonly maxColumns = $derived(clamp(this.#opt('maxColumns') ?? 4, 1, 12));
	readonly firstPageAlone = $derived(this.#opt('firstPageAlone') ?? false);
	readonly canZoomIn = $derived(
		!this.zoomLocked && this.zoom < Math.min(this.maxZoom, this.zoomSteps.at(-1)!) - 1e-3
	);
	readonly canZoomOut = $derived(
		!this.zoomLocked && this.zoom > Math.max(this.minZoom, this.zoomSteps[0]) + 1e-3
	);
	readonly canGoPrev = $derived(this.page > 1);
	readonly canGoNext = $derived(this.page < this.document.numPages);

	/** Pages per row actually used (resolves 'auto'). */
	readonly effectiveColumns: number = $derived.by(() => {
		const mode = this.scrollMode;
		if (mode === 'horizontal' || mode === 'wrapped') return 1;
		const n = Math.max(1, this.document.numPages);
		const c = this.columns;
		if (c !== 'auto') return clamp(Math.round(c), 1, n);
		const w = rotatedSize(this.document.pageSize(1), this.rotation).width * this.scale;
		if (w <= 0 || this.available.width <= 0) return 1;
		const fit = Math.floor((this.available.width + this.gap + 1) / (w + this.gap));
		return clamp(fit, 1, Math.min(this.maxColumns, n));
	});

	#pageEls = new Map<number, HTMLElement>();
	#nearObserver: IntersectionObserver | null = null;
	#visibleObserver: IntersectionObserver | null = null;
	#internalPage = 1;
	#lastFitZoom = NaN;
	/** Fit width at the previous fit (0 before the first): tells resizes apart. */
	#fitWidthBefore = 0;
	#pendingAnchor: ClientPoint | null = null;
	#anim = new ZoomAnimator(
		() => this.zoom,
		(zoom, anchor) => {
			this.#markZooming();
			if (!this.#anim.keepMode && this.#previewZoom(zoom, anchor)) return;
			this.#commitPreview();
			this.#pendingAnchor = anchor;
			this.#setZoom(zoom);
		}
	);
	#modeSwitched = false;
	#settleTimer: ReturnType<typeof setTimeout> | 0 = 0;
	#focusKey = 0;
	#focusTimer: ReturnType<typeof setTimeout> | 0 = 0;
	#scrollRaf = 0;
	// Stable attachment keys/functions: a new key would detach and re-attach the element.
	#viewportKey = createAttachmentKey();
	#viewportAttach = (node: HTMLElement) => untrack(() => this.#attachViewport(node));
	#contentKey = createAttachmentKey();
	#contentAttach = (node: HTMLElement) => {
		this.contentEl = node;
		untrack(() => this.#measure());
		// Padding / gap set through CSS can change at runtime (classes, variables): re-measure on style changes.
		// (Not the pages container's own `style`: zoom rewrites it every frame.)
		const mo = new MutationObserver(() => this.#scheduleMeasure());
		mo.observe(node, { attributes: true, attributeFilter: ['class'] });
		const parent = node.parentElement;
		if (parent) mo.observe(parent, { attributes: true, attributeFilter: ['class', 'style'] });
		return () => {
			mo.disconnect();
			if (this.contentEl === node) this.contentEl = null;
		};
	};
	#pageKey = createAttachmentKey();
	#pageAttachments = new Map<number, (node: HTMLElement) => () => void>();

	constructor(opts: ViewerOptions) {
		this.#opts = opts;
		this.#zoom = new Synced({ value: opts.zoom ?? 1, onChange: opts.onZoomChange });
		this.#zoomMode = new Synced({
			value: opts.zoomMode ?? 'auto',
			onChange: opts.onZoomModeChange
		});
		this.#page = new Synced({ value: opts.page ?? 1, onChange: opts.onPageChange });
		this.#rotation = new Synced({ value: opts.rotation ?? 0, onChange: opts.onRotationChange });
		this.#scrollMode = new Synced({
			value: opts.scrollMode ?? 'vertical',
			onChange: opts.onScrollModeChange
		});
		this.#columns = new Synced({ value: opts.columns ?? 1, onChange: opts.onColumnsChange });
		this.selection = new TextSelectionState(this);
		// Thumbnails and previews render a page as the pages do (one pdf.js drawing per page).
		$effect(() => {
			this.document.annotationMode = this.hideNativeAnnotations ? 0 : 1;
		});
		$effect(() => {
			if (this.keyboard !== 'document') return;
			const onKey = (e: KeyboardEvent) => this.isStrayKey(e) && this.#onKeydown(e);
			document.addEventListener('keydown', onKey);
			return () => document.removeEventListener('keydown', onKey);
		});

		// Fit modes: recompute zoom when the container, page size, rotation, columns or mode change.
		$effect(() => {
			const mode = this.zoomMode;
			if (mode === 'manual' || this.document.status !== 'ready') return;
			const { height } = this.available;
			const width = this.#fitWidth;
			if (width <= 0 || height <= 0) return;
			const page = untrack(() => this.page);
			const size = rotatedSize(this.document.pageSize(page), this.rotation);
			// With a fixed column count, fit that many pages across.
			const cols = this.columns === 'auto' ? 1 : untrack(() => this.effectiveColumns);
			const gap = this.gap;
			// Within this viewer's limits: an unclamped fit would differ from the stored
			// zoom and read as a manual zoom (see below), dropping the fit mode.
			const z = clamp(
				fitZoom(mode, size, { width: (width - gap * (cols - 1)) / cols, height }),
				this.minZoom,
				this.maxZoom
			);
			this.#lastFitZoom = z;
			// The container was resized (e.g. a side panel animating open).
			const resized = this.#fitWidthBefore > 0 && width !== this.#fitWidthBefore;
			this.#fitWidthBefore = width;
			untrack(() => {
				// Switching modes animates; container resizes follow instantly.
				if (this.#modeSwitched && this.document.status === 'ready')
					this.#animateZoom(z, null, true);
				else {
					// Resizes follow every frame like a zoom gesture: bitmaps are stretched
					// and re-rendered once the size settles, not on every frame.
					if (resized && Math.abs(z - this.zoom) > 1e-4) this.#markZooming();
					this.#setZoom(z);
				}
				this.#modeSwitched = false;
			});
		});

		// New limits (or an initial / controlled zoom outside them): store the clamped zoom.
		$effect(() => {
			const min = this.minZoom;
			const max = this.maxZoom;
			untrack(() => {
				const raw = this.#zoom.current;
				if (raw < min || raw > max) this.#setZoom(raw);
			});
		});

		// A zoom that differs from the fitted one (set from outside) means "manual".
		$effect(() => {
			const z = this.zoom;
			untrack(() => {
				if (
					!this.#anim.keepMode &&
					this.zoomMode !== 'manual' &&
					Number.isFinite(this.#lastFitZoom) &&
					Math.abs(z - this.#lastFitZoom) > 1e-3
				) {
					this.#zoomMode.current = 'manual';
				}
			});
		});

		// Keep the content under the anchor fixed while scale / rotation / layout
		// changes, and animate pages to their new place when the column count changes.
		let first = true;
		let prevColumns = 0;
		$effect.pre(() => {
			void this.scale;
			void this.rotation;
			void this.scrollMode;
			const columns = this.effectiveColumns;
			if (first) {
				first = false;
				prevColumns = columns;
				return;
			}
			const relayout = columns !== prevColumns;
			prevColumns = columns;
			untrack(() => {
				const anchor = this.#captureAnchor();
				const before = relayout ? this.#snapshotNearPages() : null;
				tick().then(() => {
					if (anchor) this.#restoreAnchor(anchor);
					if (before) this.#animateRelayout(before);
				});
			});
		});

		// External page changes scroll to that page.
		$effect(() => {
			const p = this.page;
			if (p !== this.#internalPage && this.document.status === 'ready') {
				untrack(() => this.goToPage(p));
			}
		});

		// New document: jump (instantly) to the requested page once the shells exist.
		$effect(() => {
			if (this.document.status !== 'ready') return;
			const proxy = this.document.proxy;
			untrack(() => {
				// Places in the previous document mean nothing here.
				this.history.clear();
				this.scrollEl?.scrollTo({ top: 0, left: 0 });
				const p = this.page;
				this.#internalPage = 1;
				tick().then(() => {
					if (this.document.proxy !== proxy) return;
					if (p > 1) this.goToPage(p, { behavior: 'instant' });
					requestAnimationFrame(() => this.#centerX());
				});
			});
		});

		$effect(() => () => {
			this.scheduler.clear();
			this.#nearObserver?.disconnect();
			this.#visibleObserver?.disconnect();
			cancelAnimationFrame(this.#scrollRaf);
			this.#anim.stop();
			clearTimeout(this.#settleTimer);
			clearTimeout(this.#focusTimer);
		});
	}

	// ── Reactive values ────────────────────────────────────────────────────────

	get document(): PdfDocument {
		return this.#opts.document;
	}

	get zoom() {
		// A controlled or initial zoom outside the limits reads as clamped (the limits
		// effect writes the clamped value back).
		return clamp(this.#zoom.current, this.minZoom, this.maxZoom);
	}
	/** Setting zoom jumps there immediately and switches to manual mode. */
	set zoom(z: number) {
		if (this.zoomLocked) return;
		this.#stopZoomAnimation();
		this.#commitPreview();
		this.#zoomMode.current = 'manual';
		this.#setZoom(z);
	}
	get zoomMode() {
		return this.#zoomMode.current;
	}
	set zoomMode(m: ZoomMode) {
		if (this.zoomLocked) return;
		this.#stopZoomAnimation();
		if (m !== this.#zoomMode.current) this.#modeSwitched = m !== 'manual';
		this.#zoomMode.current = m;
	}
	get page() {
		return this.#page.current;
	}
	set page(p: number) {
		this.goToPage(p);
	}
	get rotation() {
		return this.#rotation.current;
	}
	set rotation(r: Rotation) {
		this.#rotation.current = (((r % 360) + 360) % 360) as Rotation;
	}
	get scrollMode() {
		return this.#scrollMode.current;
	}
	set scrollMode(m: ScrollMode) {
		this.#scrollMode.current = m;
	}
	get columns() {
		return this.#columns.current;
	}
	set columns(c: Columns) {
		this.#columns.current = c;
	}

	/** Translate a UI string (`messages` prop → setMessages() → English). */
	t(key: MessageKey, vars?: Record<string, string | number>): string {
		return formatMessage(this.#opt('messages') ?? {}, key, vars);
	}

	/** Page size in CSS px at the current scale and rotation. */
	pageCssSize(pageNumber: number): PageSize {
		const s = rotatedSize(this.document.pageSize(pageNumber), this.rotation);
		return { width: s.width * this.scale, height: s.height * this.scale };
	}

	// ── Commands ───────────────────────────────────────────────────────────────

	/** Next zoom step, eased. The anchor defaults to the viewport center. */
	zoomIn(anchor?: ClientPoint) {
		this.zoomTo(nextZoomStep(this.#anim.destination, 1, this.zoomSteps), { anchor });
	}
	zoomOut(anchor?: ClientPoint) {
		this.zoomTo(nextZoomStep(this.#anim.destination, -1, this.zoomSteps), { anchor });
	}
	/**
	 * Zoom to a value, keeping the point under `anchor` (client coordinates)
	 * fixed. While pages are narrower than the view they stay centered
	 * horizontally; once wider, the anchor is followed in both directions.
	 */
	zoomTo(zoom: number, { anchor, animate }: { anchor?: ClientPoint; animate?: boolean } = {}) {
		if (this.zoomLocked) return;
		const target = clamp(zoom, this.minZoom, this.maxZoom);
		const smooth = (animate ?? this.#opt('smoothZoom') ?? true) && !prefersReducedMotion();
		this.#zoomMode.current = 'manual';
		if (!smooth) {
			this.#stopZoomAnimation();
			this.#markZooming();
			if (this.#previewZoom(target, anchor ?? null)) return;
			this.#pendingAnchor = anchor ?? null;
			this.#setZoom(target);
			return;
		}
		this.#animateZoom(target, anchor ?? null, false);
	}

	#animateZoom(target: number, anchor: ClientPoint | null, keepMode: boolean) {
		if (!(this.#opt('smoothZoom') ?? true) || prefersReducedMotion()) {
			this.#pendingAnchor = anchor;
			this.#setZoom(target);
			return;
		}
		this.#anim.start(clamp(target, this.minZoom, this.maxZoom), anchor, keepMode);
	}

	rotateClockwise() {
		this.rotation = ((this.rotation + 90) % 360) as Rotation;
	}
	rotateCounterClockwise() {
		this.rotation = ((this.rotation + 270) % 360) as Rotation;
	}
	/** Next page (or next spread in single-page mode with several columns). */
	nextPage() {
		const group = this.#groupOf(this.page);
		return this.goToPage(this.scrollMode === 'page' ? group[group.length - 1] + 1 : this.page + 1);
	}
	prevPage() {
		const group = this.#groupOf(this.page);
		return this.goToPage(this.scrollMode === 'page' ? group[0] - 1 : this.page - 1);
	}

	/** Scroll a page into view. Resolves when scrolling ends. */
	async goToPage(pageNumber: number, opts: FocusOptions = {}) {
		const n = clamp(Math.round(pageNumber), 1, Math.max(1, this.document.numPages));
		return this.focus({ page: n }, { highlight: false, ...opts });
	}

	/**
	 * Bring any target into view: a page, a point or rect on a page (PDF space),
	 * or a named / explicit destination. Optionally flashes the region.
	 */
	async focus(target: FocusTarget, opts: FocusOptions = {}): Promise<void> {
		const doc = this.document.proxy;
		if (!doc) return;
		let pageNumber: number;
		let rect: [number, number, number, number] | undefined;
		let point: [number, number] | undefined;
		if ('dest' in target) {
			const resolved = await resolveDestination(doc, target.dest);
			if (!resolved) return;
			pageNumber = resolved.page;
			rect = resolved.rect;
			point = resolved.point;
		} else {
			pageNumber = target.page;
			rect = target.rect;
			point = target.point;
		}
		pageNumber = clamp(pageNumber, 1, this.document.numPages);
		this.#setInternalPage(pageNumber);
		if (rect) {
			const pad = opts.padding ?? this.#opt('focusPadding') ?? (6 as number | [number, number]);
			const [px, py] = Array.isArray(pad) ? pad : [pad, pad];
			const [x1, y1, x2, y2] = rect;
			rect = [
				Math.min(x1, x2) - px,
				Math.min(y1, y2) - py,
				Math.max(x1, x2) + px,
				Math.max(y1, y2) + py
			];
		}

		// Fractions (0..1) of the target within the rotated page box.
		let region = { left: 0, top: 0, width: 1, height: 0 };
		if (rect || point) {
			const page = await this.document.getPage(pageNumber);
			const vp = page.getViewport({ scale: 1, rotation: (page.rotate + this.rotation) % 360 });
			if (rect) {
				const r = pdfRectToViewport(vp, rect);
				region = {
					left: r.left / vp.width,
					top: r.top / vp.height,
					width: r.width / vp.width,
					height: r.height / vp.height
				};
			} else if (point) {
				const [x, y] = point;
				const [vx, vy] = vp.convertToViewportPoint(
					Number.isFinite(x) ? x : 0,
					Number.isFinite(y) ? y : vp.viewBox[3]
				);
				region = {
					left: clamp(vx / vp.width, 0, 1),
					top: clamp(vy / vp.height, 0, 1),
					width: 0,
					height: 0
				};
			}
		}

		if (this.scrollMode === 'page') await tick();
		const scroller = this.scrollEl;
		const pr = this.#layoutRect(pageNumber);
		if (!pr || !scroller) return;
		const offset = opts.offset ?? 16;
		const align = opts.align ?? (rect ? 'center' : 'start');
		const behavior = opts.behavior ?? (prefersReducedMotion() ? 'instant' : 'auto');
		const sr = scroller.getBoundingClientRect();
		const tTop = pr.top - sr.top + scroller.scrollTop + region.top * pr.height;
		const tLeft = pr.left - sr.left + scroller.scrollLeft + region.left * pr.width;
		const tH = region.height * pr.height;
		const tW = region.width * pr.width;
		const top = alignScroll(
			align,
			tTop,
			tH,
			scroller.clientHeight,
			scroller.scrollTop,
			offset,
			rect || point ? 0 : offset
		);
		const horizontal =
			this.scrollMode === 'horizontal' ||
			this.scrollMode === 'wrapped' ||
			this.effectiveColumns > 1;
		const left =
			horizontal || rect || point
				? alignScroll(
						rect ? 'center' : 'nearest',
						tLeft,
						horizontal && !rect && !point ? pr.width : tW,
						scroller.clientWidth,
						scroller.scrollLeft,
						offset,
						offset
					)
				: scroller.scrollLeft;

		const highlight = opts.highlight ?? (rect ? (this.#opt('focusHighlight') ?? 'pulse') : false);
		if (highlight) {
			clearTimeout(this.#focusTimer);
			const duration = opts.duration ?? this.#opt('focusDuration') ?? 1800;
			this.focusRegion = {
				page: pageNumber,
				...region,
				height: region.height || 0.02,
				// A point target highlights a line across the text block (assumes symmetric margins).
				width: region.width || Math.max(0.2, 1 - 2 * region.left),
				highlight,
				duration,
				key: ++this.#focusKey
			};
			this.#focusTimer = setTimeout(() => (this.focusRegion = null), duration);
		}
		await scrollAndWait(scroller, { top, left, behavior });
	}

	/** The current location (page + fraction), for history entries. */
	location(): ViewLocation {
		const p = this.position;
		return { page: Math.floor(p), fraction: p - Math.floor(p) };
	}

	/**
	 * Jump somewhere and remember where we came from (links, citations, outline).
	 * `back()` returns to the previous place.
	 */
	async navigate(target: FocusTarget, opts: FocusOptions = {}) {
		if (this.document.proxy) {
			this.history.push(this.location());
		}
		return this.focus(target, { behavior: prefersReducedMotion() ? 'instant' : 'smooth', ...opts });
	}

	async back() {
		const to = this.history.goBack(this.location());
		if (to) return this.#goToLocation(to);
	}

	async forward() {
		const to = this.history.goForward(this.location());
		if (to) return this.#goToLocation(to);
	}

	/** The PDF point at `fraction` down the page as shown (rotation and crop box included). */
	async #pointAt(page: number, fraction: number): Promise<[number, number]> {
		const p = await this.document.getPage(page);
		const vp = p.getViewport({ scale: 1, rotation: (p.rotate + this.rotation) % 360 });
		return vp.convertToPdfPoint(0, fraction * vp.height) as [number, number];
	}

	async #goToLocation(l: ViewLocation) {
		return this.focus(
			{ page: l.page, point: await this.#pointAt(l.page, l.fraction) },
			{
				align: 'start',
				offset: 0,
				highlight: false,
				behavior: prefersReducedMotion() ? 'instant' : 'smooth'
			}
		);
	}

	/** Add facts to every context (annotations, citations…). Returns an unregister function. */
	addContextResolver(resolver: ContextResolver): () => void {
		this.#resolvers.add(resolver);
		return () => this.#resolvers.delete(resolver);
	}

	/**
	 * What is at a client position: page, PDF point, selection, link, plus
	 * whatever registered resolvers add (annotations, citation, figure…).
	 */
	async contextAt(input: {
		clientX: number;
		clientY: number;
		target?: EventTarget | null;
		source?: PdfContext['source'];
	}): Promise<PdfContext> {
		const { clientX, clientY } = input;
		const targetEl = input.target instanceof Element ? input.target : null;
		const pageEl =
			targetEl?.closest<HTMLElement>('[data-pdf-page]') ??
			document
				.elementsFromPoint(clientX, clientY)
				.find((e): e is HTMLElement => e instanceof HTMLElement && e.matches('[data-pdf-page]')) ??
			null;
		const page = pageEl ? Number(pageEl.dataset.pdfPage) || null : null;
		let point: PdfContext['point'] = null;
		if (page && pageEl && this.document.proxy) {
			const p = await this.document.getPage(page);
			const vp = p.getViewport({ scale: 1, rotation: (p.rotate + this.rotation) % 360 });
			const r = pageEl.getBoundingClientRect();
			const [x, y] = vp.convertToPdfPoint(
				((clientX - r.left) / r.width) * vp.width,
				((clientY - r.top) / r.height) * vp.height
			);
			point = [x, y];
		}
		const linkEl = targetEl?.closest('[data-pdf-link]') ?? null;
		const ctx: PdfContext = {
			source: input.source ?? 'pointer',
			clientX,
			clientY,
			page,
			point,
			...(this.#selectionAtRightClick && performance.now() - this.#selectionAtRightClick.at < 1500
				? {
						selection: this.#selectionAtRightClick.ranges,
						selectedText: this.#selectionAtRightClick.text
					}
				: { selection: this.selection.ranges, selectedText: this.selection.text }),
			annotations: [],
			link: linkEl ? this.linkElements.get(linkEl) : undefined
		};
		for (const resolve of this.#resolvers) {
			const extra = await resolve(ctx);
			if (extra) Object.assign(ctx, extra);
		}
		return ctx;
	}

	/** Remove the focus highlight now. */
	clearFocus() {
		clearTimeout(this.#focusTimer);
		this.focusRegion = null;
	}

	/** Fractional reading position: 3.42 = 42% into page 3. */
	get position(): number {
		const scroller = this.scrollEl;
		const pr = this.#layoutRect(this.page);
		if (!scroller || !pr) return this.page;
		const sr = scroller.getBoundingClientRect();
		return this.page + clamp((sr.top - pr.top) / pr.height, 0, 0.999);
	}

	/** Restore a fractional position from `position`. */
	async restorePosition(position: number) {
		const page = Math.floor(position);
		const frac = position - page;
		if (!this.document.proxy) return;
		await this.focus(
			{ page, point: await this.#pointAt(page, frac) },
			{ align: 'start', offset: 0, behavior: 'instant', highlight: false }
		);
	}

	// ── Prop getters (melt-style; spread onto elements) ─────────────────────────

	/** Spread on the scroll container. */
	get viewportProps() {
		return {
			'data-pdf-viewport': '',
			'data-scroll-mode': this.scrollMode,
			'data-zooming': dataAttr(this.isZooming),
			'data-has-selection': dataAttr(!this.selection.isEmpty),
			// A text selection being dragged: hotspots and annotations let the pointer through.
			'data-selecting': dataAttr(this.selection.selecting && !this.selection.isEmpty),
			tabindex: 0,
			style: 'overflow: auto; position: relative; overscroll-behavior: contain;',
			onkeydown: (e: KeyboardEvent) => this.#onKeydown(e),
			[this.#viewportKey]: this.#viewportAttach
		} as const;
	}

	/** Spread on the element that contains the pages. */
	get contentProps() {
		const mode = this.scrollMode;
		const cols = this.effectiveColumns;
		const layout = contentLayout(mode, cols);
		return {
			'data-pdf-pages': '',
			'data-scroll-mode': mode,
			'data-columns': cols,
			style:
				`position:relative;${layout}gap:var(--pdf-page-gap,16px);padding:var(--pdf-pages-padding,16px);box-sizing:border-box;` +
				`--pdf-scale:${this.scale};` +
				(this.#preview
					? `transform-origin:0 0;transform:translate(${this.#preview.tx}px,${this.#preview.ty}px) scale(${this.#preview.k});`
					: '') +
				// Page box = themed page color, so rounded corners don't show a white rim.
				(this.pageTheme.background ? `--pdf-page-bg:${this.pageTheme.background};` : ''),
			[this.#contentKey]: this.#contentAttach
		} as const;
	}

	/**
	 * Width fit modes aim for. With an aside, pages leave that room on both
	 * sides, but never lose more than a quarter of the view for it.
	 */
	readonly #fitWidth = $derived.by(() => {
		const { width } = this.available;
		if (this.aside <= 0) return width;
		return Math.max(width - 2 * this.aside, width * 0.75);
	});

	/** Widest page at scale 1 (CSS px before `--pdf-scale`). */
	readonly #widestPage = $derived.by(() => {
		let w = 0;
		for (let n = 1; n <= this.document.numPages; n++)
			w = Math.max(w, rotatedSize(this.document.pageSize(n), this.rotation).width);
		return w;
	});

	/**
	 * Free width (CSS px) on each side of the centered pages, from the edge of
	 * the widest row to the edge of the view. Follows zoom animations frame by
	 * frame; side content (margin notes) sizes itself from it.
	 */
	readonly sideRoom: number = $derived.by(() => {
		const mode = this.scrollMode;
		if (mode === 'horizontal' || mode === 'wrapped') return 0;
		const cols = this.effectiveColumns;
		const row = this.#widestPage * cols * this.scale + this.gap * (cols - 1);
		return Math.max(0, (this.available.width + this.#padX - row) / 2);
	});

	/** Pages to mount: all of them, except in single-page mode (the current spread). */
	get mountedPages(): number[] {
		const n = this.document.numPages;
		if (!n) return [];
		if (this.scrollMode === 'page') return this.#groupOf(clamp(this.page, 1, n));
		return Array.from({ length: n }, (_, i) => i + 1);
	}

	/** Spread on a page shell. Sizes follow `--pdf-scale`, so zooming only touches one style. */
	getPageProps(pageNumber: number) {
		const { width, height } = rotatedSize(this.document.pageSize(pageNumber), this.rotation);
		const cols = this.effectiveColumns;
		const placeCover =
			this.firstPageAlone && cols > 1 && pageNumber === this.mountedPages[0] && pageNumber === 1;
		return {
			'data-pdf-page': pageNumber,
			'data-visible': dataAttr(this.visiblePages.has(pageNumber)),
			'data-near': dataAttr(this.nearPages.has(pageNumber)),
			'data-current': dataAttr(this.page === pageNumber),
			role: 'region',
			'aria-label': `Page ${pageNumber}`,
			style:
				`position:relative;flex:none;width:calc(${width}px * var(--pdf-scale));height:calc(${height}px * var(--pdf-scale));` +
				PAGE_SCALE_VARS +
				(placeCover ? `grid-column:${cols};` : ''),
			[this.#pageKey]: this.#pageAttachment(pageNumber)
		} as const;
	}

	// ── Internals ──────────────────────────────────────────────────────────────

	#opt<K extends keyof ViewerOptions>(key: K): Resolved<ViewerOptions[K]> {
		return readOption(this.#opts, key);
	}

	#setZoom(z: number) {
		this.#zoom.current = clamp(Math.round(z * 1e4) / 1e4, this.minZoom, this.maxZoom);
	}

	#setInternalPage(p: number) {
		this.#internalPage = p;
		if (this.page !== p) this.#page.current = p;
	}

	/**
	 * Is another page right beside `page` on that side (a spread's other page, or the
	 * next page in a horizontal strip)? Side content (margin notes) can't spread there.
	 */
	hasNeighbor(page: number, side: 'left' | 'right'): boolean {
		const n = this.document.numPages;
		if (this.scrollMode === 'horizontal' || this.scrollMode === 'wrapped')
			return side === 'left' ? page > 1 : page < n;
		const group = this.#groupOf(page);
		const i = group.indexOf(page);
		return side === 'left' ? i > 0 : i < group.length - 1;
	}

	/** Pages shown together with `page` in single-page mode (a spread). */
	#groupOf(page: number): number[] {
		const n = this.document.numPages;
		const cols = this.effectiveColumns;
		if (cols <= 1 || !n) return [page];
		// The cover alone: rows start one page later (page 1 sits alone in the last column).
		const shift = this.firstPageAlone ? cols - 1 : 0;
		const start = Math.floor((page - 1 + shift) / cols) * cols - shift + 1;
		const first = Math.max(1, start);
		const last = Math.min(n, start + cols - 1);
		return Array.from({ length: last - first + 1 }, (_, i) => first + i);
	}

	// Zoom animation ----------------------------------------------------------

	#stopZoomAnimation() {
		this.#anim.stop();
	}

	#markZooming() {
		this.isZooming = true;
		clearTimeout(this.#settleTimer);
		this.#settleTimer = setTimeout(() => {
			if (this.#anim.running) return this.#markZooming();
			this.#commitPreview();
			this.isZooming = false;
			if (this.#measureDeferred) {
				this.#measureDeferred = false;
				this.#scheduleMeasure();
			}
		}, ZOOM_SETTLE);
	}

	/**
	 * Show a zoom step as a transform of the pages (laid out at the zoom the gesture
	 * started from), keeping the point under `anchor` fixed. False when it can't (then
	 * the zoom is applied for real).
	 */
	#previewZoom(z: number, anchor: ClientPoint | null): boolean {
		const scroller = this.scrollEl;
		const content = this.contentEl;
		if (!(this.#opt('transformZoom') ?? true) || !scroller || !content) return false;
		const before = this.zoom;
		this.#setZoom(z);
		const f = this.zoom / before;
		if (this.#previewFrom === null) {
			if (Math.abs(f - 1) < 1e-6) return true;
			this.#previewFrom = before;
			this.#previewBox = this.#pagesBox(content);
		}
		const sr = scroller.getBoundingClientRect();
		const point = anchor ?? { clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2 };
		this.#previewPoint = point;
		// The view and the point in the pages container's own (untransformed) coordinates.
		const vx = scroller.scrollLeft - content.offsetLeft;
		const vy = scroller.scrollTop - content.offsetTop;
		const px = point.clientX - (sr.left + scroller.clientLeft) + vx;
		const py = point.clientY - (sr.top + scroller.clientTop) + vy;
		const t = this.#preview ?? { k: 1, tx: 0, ty: 0 };
		const next = { k: t.k * f, tx: px * (1 - f) + f * t.tx, ty: py * (1 - f) + f * t.ty };
		// Shown where the zoom will land once laid out: pages narrower than the view
		// centered, never scrolled past their first or last edge. Letting go moves nothing.
		const box = this.#previewBox;
		if (box) {
			const { k } = next;
			const w = scroller.clientWidth;
			const h = scroller.clientHeight;
			if (k * (box.right - box.left) <= w - 2 * box.pad)
				next.tx = vx + w / 2 - (k * (box.left + box.right)) / 2;
			else next.tx = clamp(next.tx, vx + w - box.pad - k * box.right, vx + box.pad - k * box.left);
			if (k * (box.bottom - box.top) <= h - 2 * box.pad) next.ty = vy + box.pad - k * box.top;
			else next.ty = clamp(next.ty, vy + h - box.pad - k * box.bottom, vy + box.pad - k * box.top);
		}
		this.#preview = next;
		return true;
	}

	/** The pages' extent in their container: across the pages laid out, down its whole height. */
	#pagesBox(content: HTMLElement) {
		const cs = getComputedStyle(content);
		const top = parseFloat(cs.paddingTop) || 0;
		const bottom = content.offsetHeight - (parseFloat(cs.paddingBottom) || 0);
		let left = Infinity;
		let right = -Infinity;
		for (const el of this.#pageEls.values()) {
			left = Math.min(left, el.offsetLeft);
			right = Math.max(right, el.offsetLeft + el.offsetWidth);
		}
		if (!Number.isFinite(left)) return null;
		return { left, right, top, bottom, pad: parseFloat(cs.paddingLeft) || 0 };
	}

	/**
	 * End a transform zoom: lay the pages out at the new zoom (drawn again once) and keep
	 * what was under the gesture's point there.
	 */
	#commitPreview() {
		const from = this.#previewFrom;
		if (from === null) return;
		const scroller = this.scrollEl;
		const point = this.#previewPoint;
		let anchor: Anchor | null = null;
		if (scroller && point) {
			// The page under the point, as the transform shows it.
			let bestDist = Infinity;
			for (const [n, el] of this.#pageEls) {
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) continue;
				const d =
					distanceToRange(point.clientY, r.top, r.bottom) +
					distanceToRange(point.clientX, r.left, r.right);
				if (d < bestDist) {
					bestDist = d;
					anchor = {
						page: n,
						fx: (point.clientX - r.left) / r.width,
						fy: (point.clientY - r.top) / r.height,
						...point
					};
				}
			}
		}
		this.#preview = null;
		this.#previewFrom = null;
		this.#previewPoint = null;
		this.#previewBox = null;
		if (!anchor) return;
		if (Math.abs(this.zoom - from) < 1e-6) {
			// Same layout as before the gesture: put the point back by scrolling only.
			const a = anchor;
			void tick().then(() => this.#restoreAnchor(a));
		} else this.#forcedAnchor = anchor;
	}

	// Geometry ------------------------------------------------------------------

	/**
	 * Client rect of a page from layout offsets (ignores CSS transforms, so it
	 * stays correct while pages animate to a new layout).
	 */
	#layoutRect(pageNumber: number): LayoutRect | null {
		const el = this.#pageEls.get(pageNumber);
		const scroller = this.scrollEl;
		const content = this.contentEl;
		if (!el || !scroller || !content) return null;
		const sr = scroller.getBoundingClientRect();
		return {
			left:
				sr.left +
				scroller.clientLeft +
				content.offsetLeft +
				content.clientLeft -
				scroller.scrollLeft +
				el.offsetLeft,
			top:
				sr.top +
				scroller.clientTop +
				content.offsetTop +
				content.clientTop -
				scroller.scrollTop +
				el.offsetTop,
			width: el.offsetWidth,
			height: el.offsetHeight
		};
	}

	#captureAnchor(): Anchor | null {
		if (this.#forcedAnchor) {
			const a = this.#forcedAnchor;
			this.#forcedAnchor = null;
			this.#pendingAnchor = null;
			return a;
		}
		const scroller = this.scrollEl;
		if (!scroller || !this.#pageEls.size) return null;
		const sr = scroller.getBoundingClientRect();
		const point = this.#pendingAnchor ?? {
			clientX: sr.left + sr.width / 2,
			clientY: sr.top + sr.height / 2
		};
		// At the very top with no pointer anchor (e.g. fit-to-width on open): stay at the top.
		const pinTop = !this.#pendingAnchor && scroller.scrollTop <= 1;
		this.#pendingAnchor = null;
		let best: Anchor | null = null;
		let bestDist = Infinity;
		const candidates = this.visiblePages.size ? this.visiblePages : new Set([this.page]);
		for (const n of candidates) {
			const r = this.#layoutRect(n);
			if (!r) continue;
			const dy = distanceToRange(point.clientY, r.top, r.top + r.height);
			const dx = distanceToRange(point.clientX, r.left, r.left + r.width);
			const d = dx + dy;
			if (d < bestDist) {
				bestDist = d;
				best = {
					page: n,
					fx: (point.clientX - r.left) / r.width,
					fy: (point.clientY - r.top) / r.height,
					...point
				};
			}
		}
		return best && { ...best, pinTop };
	}

	#restoreAnchor(a: Anchor) {
		const scroller = this.scrollEl;
		const r = this.#layoutRect(a.page);
		if (!scroller || !r) return;
		// When pages are narrower than the view, scrollLeft clamps to 0 and the
		// centered layout keeps the page centered: zoom happens around its center.
		scroller.scrollLeft += r.left + a.fx * r.width - a.clientX;
		if (a.pinTop) scroller.scrollTop = 0;
		else scroller.scrollTop += r.top + a.fy * r.height - a.clientY;
	}

	#snapshotNearPages() {
		const snap = new Map<number, LayoutRect>();
		for (const n of this.nearPages) {
			const r = this.#layoutRect(n);
			if (r) snap.set(n, r);
		}
		return snap;
	}

	/** FLIP: slide/scale pages from their old place to the new layout. */
	#animateRelayout(before: Map<number, LayoutRect>) {
		if (prefersReducedMotion()) return;
		for (const [n, old] of before) {
			const el = this.#pageEls.get(n);
			const now = this.#layoutRect(n);
			if (!el || !now || !now.width) continue;
			const dx = old.left - now.left;
			const dy = old.top - now.top;
			const s = old.width / now.width;
			if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) continue;
			el.animate(
				[
					{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})` },
					{ transformOrigin: '0 0', transform: 'none' }
				],
				{ duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
			);
		}
	}

	// DOM wiring ----------------------------------------------------------------

	#attachViewport(node: HTMLElement) {
		this.scrollEl = node;
		// Measured even mid-zoom: a resize must refit (cheaply, see the fit effect).
		const ro = new ResizeObserver(() => this.#scheduleMeasure(true));
		ro.observe(node);
		this.#measure();

		const margin = () => {
			const pct = Math.round(this.overscan * 100);
			return `${pct}% ${pct}% ${pct}% ${pct}%`;
		};
		this.#nearObserver = new IntersectionObserver((entries) => this.#onIntersect(entries, 'near'), {
			root: node,
			rootMargin: margin()
		});
		this.#visibleObserver = new IntersectionObserver(
			(entries) => this.#onIntersect(entries, 'visible'),
			{
				root: node,
				threshold: [0, 0.01]
			}
		);
		for (const el of this.#pageEls.values()) {
			this.#nearObserver.observe(el);
			this.#visibleObserver.observe(el);
		}

		const onScroll = () => {
			cancelAnimationFrame(this.#scrollRaf);
			this.#scrollRaf = requestAnimationFrame(() => this.#updateCurrentPage());
		};
		const detachGestures = attachZoomGestures(node, {
			enabled: () => this.#opt('wheelZoom') ?? true,
			zoom: () => this.zoom,
			destination: () => this.#anim.destination,
			zoomTo: (z, opts) => this.zoomTo(z, opts)
		});
		let domRange: Range | null = null;
		// Remember what a context menu was opened on (pointer, or keyboard: Menu key / Shift+F10).
		const onContextMenu = (e: MouseEvent) => {
			// Re-apply now and once the menu has opened (opening moves focus, which can collapse it).
			const range = domRange;
			domRange = null;
			const restore = () => {
				const sel = getSelection();
				if (range && sel?.isCollapsed) {
					sel.removeAllRanges();
					sel.addRange(range);
				}
			};
			restore();
			requestAnimationFrame(() => requestAnimationFrame(restore));
			const keyboard = e.button !== 2 && e.clientX === 0 && e.clientY === 0;
			let clientX = e.clientX;
			let clientY = e.clientY;
			let target: EventTarget | null = e.target;
			if (keyboard) {
				const rect =
					this.selection.anchorRect ??
					(document.activeElement as HTMLElement | null)?.getBoundingClientRect() ??
					node.getBoundingClientRect();
				clientX = rect.left + rect.width / 2;
				clientY = rect.top + rect.height / 2;
				target = document.activeElement;
			}
			this.contextAt({ clientX, clientY, target, source: keyboard ? 'keyboard' : 'pointer' }).then(
				(ctx) => (this.lastContext = ctx)
			);
		};
		const onRightDown = (e: PointerEvent) => {
			if (e.button !== 2) return;
			// Browsers clear the selection on a right mousedown: keep it to restore once the
			// menu opens, so what the menu acts on stays highlighted.
			const sel = getSelection();
			domRange = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
			this.selection.refresh();
			this.#selectionAtRightClick = {
				ranges: this.selection.ranges,
				text: this.selection.text,
				at: performance.now()
			};
		};
		node.addEventListener('pointerdown', onRightDown, true);
		node.addEventListener('contextmenu', onContextMenu, true);
		node.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			ro.disconnect();
			this.#nearObserver?.disconnect();
			this.#visibleObserver?.disconnect();
			this.#nearObserver = this.#visibleObserver = null;
			detachGestures();
			node.removeEventListener('contextmenu', onContextMenu, true);
			node.removeEventListener('pointerdown', onRightDown, true);
			node.removeEventListener('scroll', onScroll);
			if (this.scrollEl === node) this.scrollEl = null;
		};
	}

	#measureRaf = 0;
	#measureDeferred = false;

	/** Coalesce measurements to one per frame; never force style recalcs mid-zoom. */
	#scheduleMeasure(force = false) {
		if (this.isZooming && !force) {
			this.#measureDeferred = true;
			return;
		}
		cancelAnimationFrame(this.#measureRaf);
		this.#measureRaf = requestAnimationFrame(() => untrack(() => this.#measure()));
	}

	/** Pages wider than the view: scroll horizontally so the current page is centered. */
	#centerX() {
		const el = this.scrollEl;
		if (!el || el.scrollWidth <= el.clientWidth + 1) return;
		const rect = this.#layoutRect(this.page) ?? this.#layoutRect(this.mountedPages[0] ?? 1);
		if (!rect) return;
		const sr = el.getBoundingClientRect();
		const delta = rect.left + rect.width / 2 - (sr.left + el.clientLeft + el.clientWidth / 2);
		el.scrollLeft += delta;
	}

	#measure() {
		const node = this.scrollEl;
		if (!node) return;
		const content = this.contentEl;
		const cs = content ? getComputedStyle(content) : null;
		const padX = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0;
		const padY = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0;
		const gap = cs ? parseFloat(cs.columnGap) || parseFloat(cs.rowGap) || 0 : 16;
		const aside = cs ? parseFloat(cs.getPropertyValue('--pdf-pages-aside')) || 0 : 0;
		const width = Math.max(0, node.clientWidth - padX);
		const height = Math.max(0, node.clientHeight - padY);
		if (width !== this.available.width || height !== this.available.height) {
			const resized = width !== this.available.width && this.available.width > 0;
			this.available = { width, height };
			if (resized) requestAnimationFrame(() => this.#centerX());
		}
		if (aside !== this.aside) this.aside = aside;
		if (padX !== this.#padX) this.#padX = padX;
		if (Number.isFinite(gap) && gap !== this.gap) this.gap = gap;
	}

	#pageAttachment(pageNumber: number) {
		let fn = this.#pageAttachments.get(pageNumber);
		if (!fn) {
			fn = (node: HTMLElement) => untrack(() => this.#registerPage(pageNumber, node));
			this.#pageAttachments.set(pageNumber, fn);
		}
		return fn;
	}

	#registerPage(pageNumber: number, node: HTMLElement) {
		this.#pageEls.set(pageNumber, node);
		this.#nearObserver?.observe(node);
		this.#visibleObserver?.observe(node);
		return () => {
			if (this.#pageEls.get(pageNumber) === node) this.#pageEls.delete(pageNumber);
			this.#nearObserver?.unobserve(node);
			this.#visibleObserver?.unobserve(node);
			this.#setMembership('near', pageNumber, false);
			this.#setMembership('visible', pageNumber, false);
		};
	}

	#onIntersect(entries: IntersectionObserverEntry[], kind: 'near' | 'visible') {
		const set = new Set(kind === 'near' ? this.nearPages : this.visiblePages);
		let changed = false;
		for (const e of entries) {
			const n = Number((e.target as HTMLElement).dataset.pdfPage);
			if (!n) continue;
			const on = e.isIntersecting && (kind === 'near' || e.intersectionRatio > 0);
			if (on !== set.has(n)) {
				changed = true;
				if (on) set.add(n);
				else set.delete(n);
			}
		}
		if (!changed) return;
		if (kind === 'near') this.nearPages = set;
		else {
			this.visiblePages = set;
			this.#updateCurrentPage();
		}
	}

	#setMembership(kind: 'near' | 'visible', n: number, on: boolean) {
		const current = kind === 'near' ? this.nearPages : this.visiblePages;
		if (current.has(n) === on) return;
		const set = new Set(current);
		if (on) set.add(n);
		else set.delete(n);
		if (kind === 'near') this.nearPages = set;
		else this.visiblePages = set;
	}

	/** The current page is the visible page covering most of the viewport. */
	#updateCurrentPage() {
		const scroller = this.scrollEl;
		if (!scroller || this.scrollMode === 'page' || !this.visiblePages.size) return;
		const sr = scroller.getBoundingClientRect();
		let best = 0;
		let bestArea = -1;
		for (const n of [...this.visiblePages].sort((a, b) => a - b)) {
			const r = this.#layoutRect(n);
			if (!r) continue;
			const w = Math.max(0, Math.min(r.left + r.width, sr.right) - Math.max(r.left, sr.left));
			const h = Math.max(0, Math.min(r.top + r.height, sr.bottom) - Math.max(r.top, sr.top));
			const area = w * h;
			if (area > bestArea + 1) {
				best = n;
				bestArea = area;
			}
		}
		if (best) this.#setInternalPage(best);
		this.#updateReadingPoint();
	}

	#updateViewRange() {
		const scroller = this.scrollEl;
		if (!scroller || !this.visiblePages.size) return;
		const sr = scroller.getBoundingClientRect();
		const pages = [...this.visiblePages].sort((a, b) => a - b);
		const locate = (clientY: number, first: boolean): ViewLocation | null => {
			for (const n of first ? pages : [...pages].reverse()) {
				const r = this.#layoutRect(n);
				if (!r) continue;
				if (first ? clientY <= r.top + r.height : clientY >= r.top)
					return { page: n, fraction: clamp((clientY - r.top) / r.height, 0, 1) };
			}
			return null;
		};
		const start = locate(sr.top, true);
		const end = locate(sr.bottom, false);
		if (start && end) this.viewRange = { start, end };
	}

	/** Scroll so `loc` sits at the top (or center) of the view. Synchronous by default. */
	scrollToLocation(
		loc: ViewLocation,
		{
			align = 'start',
			behavior = 'instant'
		}: { align?: 'start' | 'center'; behavior?: ScrollBehavior } = {}
	) {
		const scroller = this.scrollEl;
		const r = this.#layoutRect(clamp(Math.round(loc.page), 1, this.document.numPages));
		if (!scroller || !r) return;
		const sr = scroller.getBoundingClientRect();
		const y = r.top - sr.top + scroller.scrollTop + clamp(loc.fraction, 0, 1) * r.height;
		scroller.scrollTo({ top: align === 'center' ? y - scroller.clientHeight / 2 : y, behavior });
	}

	#updateReadingPoint() {
		const scroller = this.scrollEl;
		if (!scroller) return;
		this.#updateViewRange();
		const sr = scroller.getBoundingClientRect();
		const probeY = sr.top + Math.min(120, sr.height * 0.2);
		for (const n of [...this.visiblePages].sort((a, b) => a - b)) {
			const r = this.#layoutRect(n);
			if (!r || probeY < r.top - this.gap || probeY > r.top + r.height) continue;
			const fraction = clamp((probeY - r.top) / r.height, 0, 1);
			// Sideways pages have no PDF y down the screen: count the whole page as read.
			const y = fractionToPdfY(this.document.pageSize(n), fraction, this.rotation) ?? -Infinity;
			const prev = this.readingPoint;
			if (prev.page !== n || Math.abs(prev.fraction - fraction) > 0.002)
				this.readingPoint = { page: n, y, fraction };
			return;
		}
	}

	/**
	 * With `keyboard: 'document'`: a key pressed outside the viewport that the
	 * viewer should still handle (not in a text field, dialog or menu).
	 */
	isStrayKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (!target || this.scrollEl?.contains(target)) return false;
		return !target.closest?.(
			'[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
		);
	}

	#onKeydown(e: KeyboardEvent) {
		if (!this.keyboard || e.defaultPrevented) return;
		const target = e.target as HTMLElement;
		if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		const scroller = this.scrollEl;
		const fitsH = !scroller || scroller.scrollWidth <= scroller.clientWidth + 1;
		const paged = this.scrollMode === 'page';
		const action = matchAction(e, this.keymap, [
			'view.zoomIn',
			'view.zoomOut',
			'view.fitWidth',
			'view.rotateCw',
			'view.rotateCcw',
			'nav.back',
			'nav.forward',
			'nav.nextPage',
			'nav.prevPage',
			'nav.firstPage',
			'nav.lastPage'
		]);
		let handled = true;
		switch (action) {
			case 'view.zoomIn':
				this.zoomIn();
				break;
			case 'view.zoomOut':
				this.zoomOut();
				break;
			case 'view.fitWidth':
				this.zoomMode = 'page-width';
				break;
			case 'view.rotateCw':
				this.rotateClockwise();
				break;
			case 'view.rotateCcw':
				this.rotateCounterClockwise();
				break;
			case 'nav.back':
				this.back();
				break;
			case 'nav.forward':
				this.forward();
				break;
			// Arrows turn pages only when nothing scrolls sideways; PageUp/Down/Space only in paged mode.
			case 'nav.nextPage':
				if (
					(e.key.startsWith('Arrow') && (fitsH || paged)) ||
					(!e.key.startsWith('Arrow') && paged)
				)
					this.nextPage();
				else handled = false;
				break;
			case 'nav.prevPage':
				if (
					(e.key.startsWith('Arrow') && (fitsH || paged)) ||
					(!e.key.startsWith('Arrow') && paged)
				)
					this.prevPage();
				else handled = false;
				break;
			case 'nav.firstPage':
				this.goToPage(1);
				break;
			case 'nav.lastPage':
				this.goToPage(this.document.numPages);
				break;
			default:
				handled = false;
		}
		if (handled) e.preventDefault();
	}
}
