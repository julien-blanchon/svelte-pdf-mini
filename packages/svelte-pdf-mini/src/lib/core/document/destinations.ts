import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfPoint, PdfRect } from '../types.js';

export interface ResolvedDestination {
	/** 1-based page. */
	page: number;
	point?: PdfPoint;
	rect?: PdfRect;
	zoom?: number;
	kind: string;
}

/**
 * Resolve a named or explicit destination to a page plus position.
 * Explicit: [ref|pageIndex, {name: 'XYZ'|'Fit'|'FitH'|'FitR'|…}, ...args]
 */
export async function resolveDestination(
	doc: PDFDocumentProxy,
	dest: unknown
): Promise<ResolvedDestination | null> {
	const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
	if (!Array.isArray(explicit)) return null;
	if (!Array.isArray(explicit) || explicit.length < 2) return null;
	const [ref, mode, ...args] = explicit as [unknown, { name: string }, ...(number | null)[]];
	let pageIndex: number;
	if (typeof ref === 'number') pageIndex = ref;
	else if (isRef(ref)) pageIndex = await doc.getPageIndex(ref);
	else return null;
	const page = pageIndex + 1;
	const kind = mode?.name ?? 'XYZ';
	const n = (v: number | null | undefined) =>
		typeof v === 'number' && Number.isFinite(v) ? v : undefined;
	switch (kind) {
		case 'XYZ': {
			const [x, y, zoom] = args;
			return { page, kind, point: [n(x) ?? 0, n(y) ?? NaN], zoom: n(zoom) || undefined };
		}
		case 'FitH':
		case 'FitBH':
			return { page, kind, point: [0, n(args[0]) ?? NaN] };
		case 'FitV':
		case 'FitBV':
			return { page, kind, point: [n(args[0]) ?? 0, NaN] };
		case 'FitR': {
			const [x1, y1, x2, y2] = args.map((a) => n(a) ?? 0);
			return { page, kind, rect: [x1, y1, x2, y2] };
		}
		default:
			return { page, kind };
	}
}

/**
 * All named destinations of a document. pdf.js's `getDestinations()` can come
 * back empty for large name trees, so this falls back to the names referenced
 * by link annotations and the outline (hyperref: section.*, figure.*, cite.*…).
 */
export async function listNamedDestinations(doc: PDFDocumentProxy): Promise<string[]> {
	const names = new Set(Object.keys((await doc.getDestinations().catch(() => ({}))) ?? {}));
	if (names.size === 0) {
		const collectOutline = (items: readonly OutlineLike[] | null) => {
			for (const item of items ?? []) {
				if (typeof item.dest === 'string') names.add(item.dest);
				collectOutline(item.items ?? []);
			}
		};
		collectOutline(await doc.getOutline().catch(() => null));
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			for (const a of await page.getAnnotations({ intent: 'display' })) {
				if (a.subtype === 'Link' && typeof a.dest === 'string') names.add(a.dest);
			}
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

interface OutlineLike {
	dest: unknown;
	items?: readonly OutlineLike[];
}

type RefProxy = { num: number; gen: number };

function isRef(v: unknown): v is RefProxy {
	return (
		!!v &&
		typeof v === 'object' &&
		typeof (v as RefProxy).num === 'number' &&
		typeof (v as RefProxy).gen === 'number'
	);
}
