import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api.js';
import { PageText, type TextItemLike, type TextStyleLike } from '../core/text/text-index.js';
import { fontStyleFromName, richTextOf, type RichText } from '../core/text/rich-copy.js';
import { renderRegionToCanvas } from '../core/document/render.js';
import { assetUrls, getPdfConfig, getSharedWorker, loadPdfJs } from '../core/document/pdfjs.js';
import type { DocumentStatus, PageSize, PdfSource } from '../core/types.js';
import type { PageThemeStrategy } from '../core/view/theme.js';
import type { Getter } from '../internal/types.js';

export interface PdfDocumentOptions {
	/** What to load. Reactive: changing it unloads the previous document. */
	src: Getter<PdfSource | null | undefined>;
	/** Initial password (otherwise status becomes 'password'). */
	password?: Getter<string | undefined>;
	/** Extra options for pdf.js `getDocument()`. */
	documentOptions?: Getter<Record<string, unknown> | undefined>;
	onLoad?: (doc: PDFDocumentProxy) => void;
	onError?: (error: PdfLoadError) => void;
}

export class PdfLoadError extends Error {
	constructor(
		message: string,
		readonly kind: 'invalid' | 'missing' | 'network' | 'password' | 'unknown',
		readonly cause?: unknown
	) {
		super(message);
		this.name = 'PdfLoadError';
	}
}

/**
 * Loads a PDF and exposes it reactively.
 *
 * Must be constructed during component initialization (it owns an `$effect`),
 * or inside `$effect.root`.
 */
export class PdfDocument {
	status = $state<DocumentStatus>('idle');
	error = $state.raw<PdfLoadError | null>(null);
	/** 0..1, or NaN when the total size is unknown. */
	progress = $state(0);
	/** The pdf.js proxy. Never deep-proxied. */
	proxy = $state.raw<PDFDocumentProxy | null>(null);
	numPages = $state(0);
	/** Page sizes in PDF points with each page's own `/Rotate` (not the view rotation), index 0 = page 1. Estimated until measured. */
	pageSizes = $state.raw<PageSize[]>([]);
	/** True once every page size has been measured (not estimated). */
	sizesExact = $state(false);
	/** Set while status === 'password'. */
	passwordReason = $state<'need' | 'incorrect' | null>(null);
	fingerprint = $derived(this.proxy?.fingerprints[0] ?? null);

	#opts: PdfDocumentOptions;
	#task: PDFDocumentLoadingTask | null = null;
	#updatePassword: ((pw: string) => void) | null = null;
	#pages = new Map<number, Promise<PDFPageProxy>>();
	#text = new Map<number, Promise<TextContent>>();
	#pageText = new Map<number, Promise<PageText>>();
	#pageTextReady = new Map<number, PageText>();
	/** Page labels ("i", "ii", "1"…) when the PDF defines them. */
	pageLabels = $state.raw<string[] | null>(null);
	#generation = 0;

	constructor(opts: PdfDocumentOptions) {
		this.#opts = opts;
		$effect(() => {
			const src = opts.src();
			const password = opts.password?.();
			const extra = opts.documentOptions?.();
			if (!src) {
				this.#reset('idle');
				return;
			}
			const gen = ++this.#generation;
			this.#load(src, password, extra, gen);
			return () => this.#unload(gen);
		});
	}

	/** Answer a password prompt. */
	submitPassword(password: string) {
		if (!this.#updatePassword) return;
		this.#updatePassword(password);
		this.status = 'loading';
	}

	/** Get a page proxy (1-based, cached). */
	getPage(pageNumber: number): Promise<PDFPageProxy> {
		const doc = this.proxy;
		if (!doc) return Promise.reject(new Error('svelte-pdf-mini: document not loaded'));
		let p = this.#pages.get(pageNumber);
		if (!p) {
			p = doc.getPage(pageNumber);
			this.#pages.set(pageNumber, p);
		}
		return p;
	}

	/** Pages shown near the viewport (count per viewer): `releasePage` leaves them be. */
	#pinned = new Map<number, number>();

	/** A viewer shows this page (until `unpinPage`): thumbnails drawn meanwhile don't free it. */
	pinPage(pageNumber: number) {
		this.#pinned.set(pageNumber, (this.#pinned.get(pageNumber) ?? 0) + 1);
	}

	/** The viewer is done with the page: free it unless another one still shows it. */
	unpinPage(pageNumber: number) {
		const n = (this.#pinned.get(pageNumber) ?? 1) - 1;
		if (n > 0) return void this.#pinned.set(pageNumber, n);
		this.#pinned.delete(pageNumber);
		this.releasePage(pageNumber);
	}

	/**
	 * Free what pdf.js keeps for a page once drawn (operator list, decoded images):
	 * without it every page ever rendered stays in memory, a lot for image-heavy
	 * papers. Deferred by pdf.js until the page's renders finish; drawing it again
	 * just asks the worker again.
	 */
	releasePage(pageNumber: number) {
		if (this.#pinned.has(pageNumber)) return;
		void this.#pages
			.get(pageNumber)
			// Pinned meanwhile (scrolled back to it): keep it.
			?.then((page) => this.#pinned.has(pageNumber) || page.cleanup())
			.catch(() => {});
	}

	/** Text content of a page (cached; shared by the text layer, find, aids). */
	getTextContent(pageNumber: number): Promise<TextContent> {
		let p = this.#text.get(pageNumber);
		if (!p) {
			p = this.getPage(pageNumber).then((page) => page.getTextContent());
			this.#text.set(pageNumber, p);
			p.catch(() => this.#text.delete(pageNumber));
		}
		return p;
	}

	/** Indexed page text (search, selection → quads, quotes). Cached. */
	getPageText(pageNumber: number): Promise<PageText> {
		let p = this.#pageText.get(pageNumber);
		if (!p) {
			p = this.getTextContent(pageNumber).then((tc) => {
				const text = new PageText(pageNumber, tc, canvasMeasurer());
				this.#pageTextReady.set(pageNumber, text);
				return text;
			});
			this.#pageText.set(pageNumber, p);
			p.catch(() => this.#pageText.delete(pageNumber));
		}
		return p;
	}

	/** Formatting-preserving text of a raw range (bold / italic from font names), for "copy with formatting". */
	async richText(pageNumber: number, start: number, end: number): Promise<RichText> {
		const [page, text] = await Promise.all([
			this.getPage(pageNumber),
			this.getPageText(pageNumber)
		]);
		const objs = page.commonObjs;
		const styleOf = (fontName: string) => {
			if (!objs.has(fontName)) return undefined;
			const font = objs.get(fontName) as { name?: string } | undefined;
			return font?.name ? fontStyleFromName(font.name) : undefined;
		};
		return richTextOf(text, start, end, styleOf);
	}

	/**
	 * pdf.js annotation mode the pages render with (the viewer keeps it in sync): thumbnails
	 * and previews use the same, or pdf.js parses and decodes a page shown in both twice.
	 */
	annotationMode = $state(1);

	/**
	 * Render a PDF-space region of a page into a new canvas (figures, previews, crops, copy
	 * as image). The page's pdf.js resources are freed after, unless a viewer shows it.
	 */
	async renderRegion(
		pageNumber: number,
		rect: [number, number, number, number],
		cssWidth: number,
		opts: { signal?: AbortSignal; theme?: PageThemeStrategy } = {}
	): Promise<HTMLCanvasElement> {
		const page = await this.getPage(pageNumber);
		try {
			return await renderRegionToCanvas({
				page,
				rect,
				cssWidth,
				annotationMode: this.annotationMode,
				...opts
			});
		} finally {
			this.releasePage(pageNumber);
		}
	}

	/** The original PDF bytes (for export / download). */
	async getData(): Promise<Uint8Array> {
		if (!this.proxy) throw new Error('svelte-pdf-mini: document not loaded');
		return this.proxy.getData();
	}

	/** Suggested file name (from the URL or the PDF title). */
	fileName = $state('document.pdf');

	/** Save the PDF (or `bytes`, e.g. an export with annotations) as a file. */
	async download(name = this.fileName, bytes?: Uint8Array) {
		const data = bytes ?? (await this.getData());
		const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }));
		const a = Object.assign(document.createElement('a'), { href: url, download: name });
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	/** Print with the browser's PDF engine (pass `bytes` to print an export with annotations). */
	async print(bytes?: Uint8Array) {
		const data = bytes ?? (await this.getData());
		const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/pdf' }));
		const frame = Object.assign(document.createElement('iframe'), { src: url });
		frame.style.cssText =
			'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;right:0;bottom:0';
		document.body.append(frame);
		await new Promise<void>((resolve) => (frame.onload = () => resolve()));
		frame.contentWindow?.focus();
		frame.contentWindow?.print();
		setTimeout(() => {
			frame.remove();
			URL.revokeObjectURL(url);
		}, 60_000);
	}

	/** Document properties (metadata, page size, file size, PDF version…). */
	async getProperties(): Promise<DocumentProperties> {
		const doc = this.proxy;
		if (!doc) throw new Error('svelte-pdf-mini: document not loaded');
		const [{ info, metadata }, data] = await Promise.all([
			doc.getMetadata(),
			doc.getDownloadInfo().catch(() => ({ length: 0 }))
		]);
		const i = (info ?? {}) as Record<string, unknown>;
		const size = this.pageSize(1);
		const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
		return {
			title: metadata?.get('dc:title') ?? str(i.Title),
			author: metadata?.get('dc:creator') ?? str(i.Author),
			subject: str(i.Subject),
			keywords: str(i.Keywords),
			creator: str(i.Creator),
			producer: str(i.Producer),
			creationDate: parsePdfDate(i.CreationDate),
			modificationDate: parsePdfDate(i.ModDate),
			pdfVersion: str(i.PDFFormatVersion),
			linearized: !!i.IsLinearized,
			fileSize: (data as { length: number }).length || undefined,
			numPages: this.numPages,
			pageSize: {
				width: size.width,
				height: size.height,
				name: paperSizeName(size.width, size.height)
			},
			fingerprint: this.fingerprint ?? undefined
		};
	}

	/** The page text if it has already been indexed (text layers index their page). */
	pageTextSync(pageNumber: number): PageText | undefined {
		return this.#pageTextReady.get(pageNumber);
	}

	/** Label for a page: its PDF page label when defined, else the number. */
	pageLabel(pageNumber: number): string {
		return this.pageLabels?.[pageNumber - 1] ?? String(pageNumber);
	}

	/** Page size (falls back to page 1 / A4 while unknown). */
	pageSize(pageNumber: number): PageSize {
		return this.pageSizes[pageNumber - 1] ?? this.pageSizes[0] ?? { width: 595, height: 842 };
	}

	async #load(
		src: PdfSource,
		password: string | undefined,
		extra: Record<string, unknown> | undefined,
		gen: number
	) {
		this.#reset('loading');
		try {
			let doc: PDFDocumentProxy;
			if (isProxy(src)) {
				doc = src;
			} else {
				const pdfjs = await loadPdfJs();
				if (gen !== this.#generation) return;
				const params = {
					...assetUrls(pdfjs.version),
					...getPdfConfig().documentOptions,
					...extra,
					...(await toParams(src)),
					...(getPdfConfig().sharedWorker === false ? {} : { worker: await getSharedWorker() }),
					password
				};
				// Superseded while building the params: never start the stale load.
				if (gen !== this.#generation) return;
				const task = pdfjs.getDocument(params);
				this.#task = task;
				task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
					if (gen === this.#generation) this.progress = total ? loaded / total : NaN;
				};
				task.onPassword = (update: (pw: string) => void, reason: number) => {
					if (gen !== this.#generation) return;
					this.#updatePassword = update;
					this.passwordReason =
						reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'need';
					this.status = 'password';
				};
				doc = await task.promise;
				if (gen !== this.#generation) {
					// Superseded mid-load (destroying twice is harmless).
					void task.destroy();
					return;
				}
			}
			if (gen !== this.#generation) return;
			const first = await doc.getPage(1);
			if (gen !== this.#generation) return;
			const firstSize = sizeOf(first);
			this.#pages.set(1, Promise.resolve(first));
			this.proxy = doc;
			this.numPages = doc.numPages;
			this.fileName = fileNameOf(src);
			this.pageSizes = Array.from({ length: doc.numPages }, () => firstSize);
			this.progress = 1;
			this.passwordReason = null;
			this.status = 'ready';
			this.#opts.onLoad?.(doc);
			doc.getPageLabels().then(
				(labels) => {
					// Only keep labels that differ from plain numbering.
					if (gen === this.#generation && labels?.some((l, i) => l !== String(i + 1)))
						this.pageLabels = labels;
				},
				() => {}
			);
			this.#measureAll(doc, gen);
		} catch (err) {
			if (gen !== this.#generation) return;
			const error = toLoadError(err);
			this.error = error;
			this.status = 'error';
			this.#opts.onError?.(error);
		}
	}

	/** Measure every page size in the background, in batches. */
	async #measureAll(doc: PDFDocumentProxy, gen: number) {
		const sizes = [...this.pageSizes];
		const batch = 50;
		for (let start = 2; start <= doc.numPages; start += batch) {
			const end = Math.min(doc.numPages, start + batch - 1);
			const pages = await Promise.all(
				Array.from({ length: end - start + 1 }, (_, i) => this.getPage(start + i))
			).catch(() => null);
			if (!pages || gen !== this.#generation) return;
			pages.forEach((p, i) => (sizes[start - 1 + i] = sizeOf(p)));
			this.pageSizes = [...sizes];
		}
		if (gen === this.#generation) this.sizesExact = true;
	}

	#unload(gen: number) {
		if (gen !== this.#generation) return;
		this.#generation++;
		const task = this.#task;
		this.#task = null;
		this.#pages.clear();
		this.#text.clear();
		this.#pageText.clear();
		this.#pageTextReady.clear();
		// The task owns the document it created; external proxies belong to the caller.
		if (task) void task.destroy();
	}

	#reset(status: DocumentStatus) {
		this.status = status;
		this.error = null;
		this.progress = 0;
		this.proxy = null;
		this.numPages = 0;
		this.pageSizes = [];
		this.sizesExact = false;
		this.pageLabels = null;
		this.passwordReason = null;
		this.#updatePassword = null;
	}
}

function sizeOf(page: PDFPageProxy): PageSize {
	const vp = page.getViewport({ scale: 1 });
	const [x1, y1, x2, y2] = vp.viewBox;
	return { width: vp.width, height: vp.height, viewBox: [x1, y1, x2, y2], rotate: page.rotate };
}

function isProxy(src: unknown): src is PDFDocumentProxy {
	return !!src && typeof src === 'object' && 'numPages' in src && 'getPage' in src;
}

async function toParams(
	src: Exclude<PdfSource, PDFDocumentProxy>
): Promise<Record<string, unknown>> {
	if (typeof src === 'string' || src instanceof URL) return { url: String(src) };
	if (src instanceof Blob) return { data: new Uint8Array(await src.arrayBuffer()) };
	// pdf.js transfers (detaches) the buffer it receives, so pass a copy.
	if (src instanceof ArrayBuffer) return { data: new Uint8Array(src.slice(0)) };
	if (src instanceof Uint8Array) return { data: src.slice() };
	if ('transfer' in src) {
		// Handed over once: pdf.js detaches the buffer.
		if (!src.data.byteLength)
			throw new Error(
				'svelte-pdf-mini: these bytes were already handed over (a `transfer` source loads once)'
			);
		return { data: src.data };
	}
	return {
		url: String(src.url),
		httpHeaders: src.httpHeaders,
		withCredentials: src.withCredentials
	};
}

function toLoadError(err: unknown): PdfLoadError {
	const name = (err as { name?: string })?.name ?? '';
	const message = (err as { message?: string })?.message ?? String(err);
	if (name === 'InvalidPDFException') return new PdfLoadError(message, 'invalid', err);
	if (name === 'MissingPDFException' || /404|not found/i.test(message))
		return new PdfLoadError(message, 'missing', err);
	if (name === 'UnexpectedResponseException' || /fetch|network/i.test(message))
		return new PdfLoadError(message, 'network', err);
	if (name === 'PasswordException') return new PdfLoadError(message, 'password', err);
	return new PdfLoadError(message, 'unknown', err);
}

/** Accurate partial-width measurement with a shared 2D context (browser only). */
function canvasMeasurer() {
	if (typeof OffscreenCanvas === 'undefined') return null;
	const ctx = new OffscreenCanvas(1, 1).getContext('2d');
	if (!ctx) return null;
	return (text: string, _item: TextItemLike, style: TextStyleLike | undefined) => {
		ctx.font = `100px ${style?.fontFamily ?? 'sans-serif'}`;
		return ctx.measureText(text).width;
	};
}

export interface DocumentProperties {
	title?: string;
	author?: string;
	subject?: string;
	keywords?: string;
	creator?: string;
	producer?: string;
	creationDate?: Date;
	modificationDate?: Date;
	pdfVersion?: string;
	linearized: boolean;
	fileSize?: number;
	numPages: number;
	pageSize: { width: number; height: number; name?: string };
	fingerprint?: string;
}

/** The URL a source was loaded from ('' for in-memory data). */
function sourceUrl(src: PdfSource): string {
	if (typeof src === 'string' || src instanceof URL) return String(src);
	if (typeof src === 'object' && src && 'url' in src) return String(src.url);
	return '';
}

function fileNameOf(src: PdfSource): string {
	if (typeof File !== 'undefined' && src instanceof File) return src.name;
	const url = sourceUrl(src);
	const last = url.split(/[?#]/)[0].split('/').filter(Boolean).pop();
	if (!last) return 'document.pdf';
	return /\.pdf$/i.test(last) ? decodeURIComponent(last) : `${decodeURIComponent(last)}.pdf`;
}

function parsePdfDate(v: unknown): Date | undefined {
	if (typeof v !== 'string') return undefined;
	const m = v.match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?/);
	if (!m) return undefined;
	const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz, th = '00', tm = '00'] = m;
	const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${!tz || tz === 'Z' ? 'Z' : `${tz}${th}:${tm}`}`;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** ISO / US paper name for a page size in points (portrait or landscape). */
export function paperSizeName(w: number, h: number): string | undefined {
	const sizes: [string, number, number][] = [
		['A3', 842, 1191],
		['A4', 595, 842],
		['A5', 420, 595],
		['B4', 709, 1001],
		['B5', 499, 709],
		['Letter', 612, 792],
		['Legal', 612, 1008],
		['Tabloid', 792, 1224]
	];
	const [a, b] = [Math.min(w, h), Math.max(w, h)];
	return sizes.find(([, x, y]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)?.[0];
}
