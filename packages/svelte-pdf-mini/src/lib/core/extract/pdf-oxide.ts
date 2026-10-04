/**
 * Optional adapter for pdf_oxide (Rust → WASM, MIT/Apache-2.0). Not a
 * dependency: pass a loader so bundlers only fetch the ~18 MB WASM when used,
 * ideally from a Web Worker:
 *
 *   pdfOxideExtractor({ load: () => import('pdf-oxide-wasm'), getData: () => doc.getData() })
 *
 * In our tests on academic papers its table detection misses rule-light
 * tables, so the built-in layoutExtractor stays the default; use this for
 * documents with ruled tables or when you need its other features.
 */
import type { RegionExtraction, RegionExtractor, RegionRequest } from './types.js';
import { toHtmlTable, toMarkdownTable } from './layout.js';

interface OxideModule {
	default?: (input?: unknown) => Promise<unknown>;
	WasmPdfDocument: new (data: Uint8Array) => {
		extractTables(page: number, region?: Float32Array | null): unknown;
		extractText(page: number, region: unknown): string;
		free?(): void;
	};
}

export function pdfOxideExtractor(opts: {
	load: () => Promise<unknown>;
	getData: () => Promise<Uint8Array>;
}): RegionExtractor {
	let doc: Promise<InstanceType<OxideModule['WasmPdfDocument']>> | null = null;
	const open = () =>
		(doc ??= (async () => {
			const mod = (await opts.load()) as OxideModule;
			if (typeof mod.default === 'function') await mod.default();
			return new mod.WasmPdfDocument(await opts.getData());
		})());
	return {
		id: 'pdf-oxide',
		async extract(req: RegionRequest): Promise<RegionExtraction | null> {
			const d = await open();
			const [x1, y1, x2, y2] = req.rect;
			const region = new Float32Array([x1, y1, x2 - x1, y2 - y1]);
			const tables = d.extractTables(req.page - 1, region) as
				{ cells?: string[][]; rows?: { cells: { text: string }[] }[] }[] | undefined;
			const t = tables?.[0];
			const cells = t?.cells ?? t?.rows?.map((r) => r.cells.map((c) => c.text));
			if (cells?.length)
				return {
					markdown: toMarkdownTable(cells),
					html: toHtmlTable(cells),
					cells,
					source: 'pdf-oxide'
				};
			const text = d.extractText(req.page - 1, region).trim();
			return text ? { markdown: text, source: 'pdf-oxide' } : null;
		}
	};
}
