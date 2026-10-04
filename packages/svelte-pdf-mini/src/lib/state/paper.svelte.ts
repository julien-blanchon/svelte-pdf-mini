import { SvelteMap } from 'svelte/reactivity';
import { analyzePaper } from '../core/paper/analyze.js';
import { flattenSections, sectionAt } from '../core/paper/sections.js';
import { pdfjsPaperSource } from '../core/paper/source.js';
import type {
	CrossRef,
	Figure,
	InTextCitation,
	PaperModel,
	Reference,
	Section
} from '../core/paper/types.js';
import type { CitationProvider, PaperMetadata } from '../core/providers/types.js';
import { extract, type MaybeGetter } from '../internal/types.js';
import { LruCache } from '../core/cache/lru.js';
import type { KeyValueStore } from '../core/cache/kv.js';
import { assetUrls, getPdfConfig, loadPdfJs } from '../core/document/pdfjs.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewerState } from './viewer.svelte.js';

export interface PaperStateOptions {
	viewer: ViewerState;
	/** Enriches references (abstract, citation count, links). Optional: everything works from the PDF alone. */
	provider?: MaybeGetter<CitationProvider | null | undefined>;
	/** Run the analysis automatically when the document loads. Default true. */
	auto?: MaybeGetter<boolean | undefined>;
	onAnalyzed?: (model: PaperModel) => void;
	/**
	 * Run the heavy part of the analysis (operator lists of every page) on a
	 * dedicated pdf.js worker so it never queues in front of page rendering.
	 * Default true in browsers.
	 */
	isolate?: MaybeGetter<boolean | undefined>;
	/** Persistent cache of analysis results by document fingerprint (e.g. `indexedDbStore('papers')`). */
	cache?: MaybeGetter<KeyValueStore<PaperModel> | null | undefined>;
}

/** Results of recent analyses, by document fingerprint + analyser version. */
const memoryCache = new LruCache<string, PaperModel>(12);
/** Bump when the analyser output changes shape, to ignore stale persisted results. */
export const PAPER_ANALYSIS_VERSION = 3;

/** What the pointer is over: a citation, a cross-reference, or a label with backlinks. */
export interface PaperHover {
	kind: 'citation' | 'crossref' | 'backlinks';
	id: string;
	anchor: Element;
}

export type MetadataState =
	| { status: 'loading' }
	| { status: 'done'; data: PaperMetadata | null }
	| { status: 'error'; error: string };

/**
 * Research-paper model for a document: sections, references, in-text
 * citations, figures and cross-references (from the PDF alone), the active
 * section while reading, and optional metadata enrichment for references.
 */
export class PaperState {
	readonly viewer: ViewerState;
	model = $state.raw<PaperModel | null>(null);
	status = $state<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
	progress = $state(0);
	stage = $state('');
	error = $state<string | null>(null);
	hovered = $state.raw<PaperHover | null>(null);
	/** Enrichment per reference id. */
	readonly metadata = new SvelteMap<string, MetadataState>();

	#opts: PaperStateOptions;

	readonly sections = $derived(this.model?.sections ?? []);
	readonly flatSections = $derived(flattenSections(this.sections));
	readonly references = $derived(this.model?.references ?? []);
	readonly citations = $derived(this.model?.citations ?? []);
	readonly figures = $derived(this.model?.figures ?? []);
	readonly crossRefs = $derived(this.model?.crossRefs ?? []);
	readonly meta = $derived(this.model?.meta ?? null);
	readonly referenceById = $derived(new Map(this.references.map((r) => [r.id, r])));
	readonly figureById = $derived(new Map(this.figures.map((f) => [f.id, f])));
	readonly citationsByPage = $derived(groupByPage(this.citations));
	readonly crossRefsByPage = $derived(groupByPage(this.crossRefs));
	/**
	 * Backlinks: the cross-references pointing at each figure, table,
	 * equation or section (by target id), in reading order.
	 */
	readonly mentions = $derived.by(() => {
		const map = new Map<string, CrossRef[]>();
		for (const x of this.crossRefs) {
			if (!x.targetId) continue;
			let list = map.get(x.targetId);
			if (!list) map.set(x.targetId, (list = []));
			list.push(x);
		}
		return map;
	});
	/** In-text citations pointing at each reference, in reading order. */
	readonly citationsByReference = $derived.by(() => {
		const map = new Map<string, InTextCitation[]>();
		for (const c of this.citations)
			for (const id of c.referenceIds) {
				let list = map.get(id);
				if (!list) map.set(id, (list = []));
				list.push(c);
			}
		return map;
	});
	/** The section being read (deepest). */
	readonly activeSection: Section | null = $derived.by(() => {
		const { page, y } = this.viewer.readingPoint;
		return this.sections.length
			? sectionAt(
					this.sections,
					page,
					Number.isFinite(y) ? y : this.viewer.document.pageSize(page).height
				)
			: null;
	});
	/** Root → active section. */
	readonly activePath = $derived.by(() => {
		const active = this.activeSection;
		if (!active) return [] as Section[];
		const path: Section[] = [];
		const walk = (list: Section[]): boolean => {
			for (const s of list) {
				path.push(s);
				if (s === active || walk(s.children)) return true;
				path.pop();
			}
			return false;
		};
		walk(this.sections);
		return path;
	});
	/** Reading progress through the document, 0..1. */
	readonly readingProgress = $derived.by(() => {
		const n = this.viewer.document.numPages;
		const { page, fraction } = this.viewer.readingPoint;
		return n ? Math.min(1, (page - 1 + fraction) / n) : 0;
	});

	/** Is a PDF point inside any of these quads / this rect (with a little slack)? */
	static #inRect([x1, y1, x2, y2]: number[], x: number, y: number, pad = 1) {
		return (
			x >= Math.min(x1, x2) - pad &&
			x <= Math.max(x1, x2) + pad &&
			y >= Math.min(y1, y2) - pad &&
			y <= Math.max(y1, y2) + pad
		);
	}

	constructor(opts: PaperStateOptions) {
		this.#opts = opts;
		this.viewer = opts.viewer;
		// Context menus: citation, cross-reference, figure and section at the point.
		$effect(() =>
			this.viewer.addContextResolver((ctx) => {
				if (!ctx.page || !ctx.point || !this.model) return;
				const [x, y] = ctx.point;
				const page = ctx.page;
				const inQuads = (q: { quads: number[][]; rect: number[] }) =>
					q.quads.length
						? q.quads.some((quad) =>
								PaperState.#inRect(
									[
										Math.min(quad[0], quad[4]),
										Math.min(quad[5], quad[7]),
										Math.max(quad[2], quad[6]),
										Math.max(quad[1], quad[3])
									],
									x,
									y
								)
							)
						: PaperState.#inRect(q.rect, x, y);
				const citation = this.citationsByPage.get(page)?.find(inQuads);
				const crossRef = this.crossRefsByPage.get(page)?.find(inQuads);
				const figure = this.figures.find(
					(f) => f.page === page && PaperState.#inRect(f.rect, x, y, 0)
				);
				const section = sectionAt(this.sections, page, y) ?? undefined;
				return {
					citation,
					references: citation?.referenceIds
						.map((id) => this.referenceById.get(id))
						.filter((r): r is Reference => !!r),
					crossRef,
					figure,
					section
				};
			})
		);
		$effect(() => {
			const doc = this.viewer.document.proxy;
			if (!doc || !extract(opts.auto, true)) {
				this.model = null;
				this.status = 'idle';
				return;
			}
			const controller = new AbortController();
			this.analyze(controller.signal);
			return () => controller.abort();
		});
	}

	get provider(): CitationProvider | null {
		return extract(this.#opts.provider) ?? null;
	}

	/** (Re)run the analysis. */
	async analyze(signal?: AbortSignal) {
		const document = this.viewer.document;
		const doc = document.proxy;
		if (!doc) return;
		this.status = 'analyzing';
		this.progress = 0;
		this.metadata.clear();
		const key = `${doc.fingerprints[0]}:v${PAPER_ANALYSIS_VERSION}`;
		const store = extract(this.#opts.cache) ?? null;
		let isolated: { doc: PDFDocumentProxy; destroy(): Promise<void> } | null = null;
		try {
			let model = memoryCache.get(key) ?? (await store?.get(key).catch(() => undefined));
			if (!model) {
				isolated = extract(this.#opts.isolate, true)
					? await openIsolated(doc).catch(() => null)
					: null;
				// Page text comes from the shared cache (also used by find / selection);
				// operator lists, links and destinations from the isolated copy.
				model = await analyzePaper(
					pdfjsPaperSource(isolated?.doc ?? doc, { getPageText: (n) => document.getPageText(n) }),
					{
						signal,
						onProgress: (f, stage) => {
							this.progress = f;
							this.stage = stage;
						}
					}
				);
				if (!signal?.aborted) store?.set(key, model).catch(() => {});
			}
			memoryCache.set(key, model);
			if (signal?.aborted || document.proxy !== doc) return;
			this.model = model;
			this.progress = 1;
			this.status = 'ready';
			this.#opts.onAnalyzed?.(model);
		} catch (err) {
			if (signal?.aborted) return;
			this.error = err instanceof Error ? err.message : String(err);
			this.status = 'error';
		} finally {
			void isolated?.destroy();
		}
	}

	/** Fetch (once) metadata for a reference from the provider. */
	resolve(ref: Reference): MetadataState | undefined {
		const existing = this.metadata.get(ref.id);
		const provider = this.provider;
		if (existing || !provider) return existing;
		this.metadata.set(ref.id, { status: 'loading' });
		provider
			.resolve(ref)
			.then((data) => this.metadata.set(ref.id, { status: 'done', data }))
			.catch((e) => this.metadata.set(ref.id, { status: 'error', error: String(e?.message ?? e) }));
		return this.metadata.get(ref.id);
	}

	// ── Navigation (all remember where you came from: viewer.back()) ─────────

	goToReference(ref: Reference) {
		return this.viewer.navigate(
			{ page: ref.page, rect: ref.rect },
			{ highlight: 'pulse', align: 'center' }
		);
	}

	goToCitation(c: InTextCitation) {
		return this.viewer.navigate(
			{ page: c.page, rect: c.rect },
			{ highlight: 'pulse', align: 'center' }
		);
	}

	goToSection(s: Section) {
		return this.viewer.navigate(
			{ page: s.page, point: [0, s.y + 4] },
			{ align: 'start', highlight: false }
		);
	}

	goToFigure(f: Figure) {
		return this.viewer.navigate(
			{ page: f.page, rect: f.rect },
			{ highlight: 'outline', align: 'center' }
		);
	}

	/** Jump to where a cross-reference is written (a backlink), not to its target. */
	goToMention(x: CrossRef) {
		return this.viewer.navigate({ page: x.page, rect: x.rect }, { align: 'center' });
	}

	goToCrossRef(x: CrossRef) {
		const fig = x.targetId ? this.figureById.get(x.targetId) : undefined;
		if (fig) return this.goToFigure(fig);
		const section = x.targetId ? this.flatSections.find((s) => s.id === x.targetId) : undefined;
		if (section) return this.goToSection(section);
		if (x.target)
			return this.viewer.navigate(
				x.target.rect
					? { page: x.target.page, rect: x.target.rect }
					: { page: x.target.page, point: x.target.point },
				{ highlight: 'pulse' }
			);
		if (x.dest) return this.viewer.navigate({ dest: x.dest }, { highlight: 'pulse' });
	}
}

function groupByPage<T extends { page: number }>(items: T[]) {
	const map = new Map<number, T[]>();
	for (const it of items) {
		let list = map.get(it.page);
		if (!list) map.set(it.page, (list = []));
		list.push(it);
	}
	return map;
}

/**
 * A second copy of the document on its own pdf.js worker (thread), for
 * analysis work that would otherwise sit in the rendering worker's queue.
 */
async function openIsolated(doc: PDFDocumentProxy) {
	// An app-provided `workerPort` is the only worker we may use: analyse on it.
	if (typeof Worker === 'undefined' || getPdfConfig().workerPort) return null;
	const pdfjs = await loadPdfJs();
	const worker = new pdfjs.PDFWorker();
	const task = pdfjs.getDocument({
		...assetUrls(pdfjs.version),
		data: await doc.getData(),
		worker
	});
	const copy = await task.promise;
	return {
		doc: copy,
		async destroy() {
			await task.destroy();
			worker.destroy();
		}
	};
}
