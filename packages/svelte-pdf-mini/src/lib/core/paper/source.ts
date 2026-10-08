/**
 * `PaperSource` adapter for a pdf.js document. Works in browsers, workers and
 * Node (pdf.js legacy build). Reuse an existing text cache via `getPageText`.
 */
import { pageGraphics } from '../document/image-boxes.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resolveDestination } from '../document/destinations.js';
import { PageText, type TextContentLike, type TextMeasurer } from '../text/text-index.js';
import type { PdfRect } from '../types.js';
import type { LinkLike, OutlineNodeLike, PaperSource, ResolvedTarget } from './types.js';

export interface PdfjsPaperSourceOptions {
	/** Use an existing PageText cache (e.g. PdfDocument's). */
	getPageText?: (page: number) => Promise<PageText>;
	measure?: TextMeasurer;
}

export function pdfjsPaperSource(
	doc: PDFDocumentProxy,
	opts: PdfjsPaperSourceOptions = {}
): PaperSource {
	const texts = new Map<number, Promise<PageText>>();
	const sizes = new Map<number, { width: number; height: number }>();
	const dests = new Map<string, Promise<ResolvedTarget | null>>();

	const getPage = async (n: number) => {
		const page = await doc.getPage(n);
		if (!sizes.has(n)) {
			const [x1, y1, x2, y2] = page.view;
			sizes.set(n, { width: x2 - x1, height: y2 - y1 });
		}
		return page;
	};

	const graphics = async (n: number) => {
		const page = await getPage(n);
		try {
			return await pageGraphics(page);
		} finally {
			// The operator list (and the images it decoded) was only needed for this
			// analysis: free it, or an image-heavy paper stays in memory whole.
			page.cleanup();
		}
	};

	return {
		numPages: doc.numPages,
		getPageText(n) {
			if (opts.getPageText) return opts.getPageText(n);
			let p = texts.get(n);
			if (!p) {
				p = getPage(n).then(
					async (page) =>
						new PageText(n, (await page.getTextContent()) as TextContentLike, opts.measure ?? null)
				);
				texts.set(n, p);
			}
			return p;
		},
		async getLinks(n) {
			const page = await getPage(n);
			const annots = await page.getAnnotations({ intent: 'display' });
			const out: LinkLike[] = [];
			for (const a of annots) {
				if (a.subtype !== 'Link' || !a.rect) continue;
				out.push({
					rect: a.rect as PdfRect,
					dest: a.dest ?? null,
					// Only what pdf.js deems safe (never `javascript:` and the like).
					url: a.url ?? null
				});
			}
			return out;
		},
		async getOutline() {
			return ((await doc.getOutline().catch(() => null)) as OutlineNodeLike[] | null) ?? null;
		},
		resolveDest(dest) {
			const key = typeof dest === 'string' ? dest : JSON.stringify(dest);
			let p = dests.get(key);
			if (!p) {
				p = resolveDestination(doc, dest)
					.then((r) => (r ? { page: r.page, point: r.point, rect: r.rect } : null))
					.catch(() => null);
				dests.set(key, p);
			}
			return p;
		},
		async getImageBoxes(n) {
			return (await graphics(n)).images;
		},
		getGraphics: graphics,
		pageSize(n) {
			return sizes.get(n) ?? { width: 612, height: 792 };
		}
	};
}
