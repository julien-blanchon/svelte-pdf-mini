/** `analyzePaper()`: one pass over a document → `PaperModel`. */
import { extractCitations } from './citations.js';
import { buildContext } from './context.js';
import { extractCrossRefs } from './crossrefs.js';
import { extractEquations, extractFigures } from './figures.js';
import { classifyLinks } from './links.js';
import { extractMeta } from './meta.js';
import { extractReferences } from './references.js';
import { extractSections } from './sections.js';
import type { AnalyzeOptions, PaperModel, PaperSource } from './types.js';

export async function analyzePaper(
	src: PaperSource,
	opts: AnalyzeOptions = {}
): Promise<PaperModel> {
	const t0 = performance.now();
	const { signal } = opts;
	const progress = (f: number, stage: string) => opts.onProgress?.(Math.min(1, f), stage);

	const ctx = await buildContext(src, signal, (f) => progress(f * 0.6, 'text'));
	signal?.throwIfAborted();
	const outline = await src.getOutline().catch(() => null);
	const meta = extractMeta(ctx);
	const sections = await extractSections(ctx, outline);
	progress(0.65, 'sections');
	signal?.throwIfAborted();
	const refs = await extractReferences(ctx, sections);
	progress(0.75, 'references');
	const links = await classifyLinks(ctx, refs.region);
	const citations = await extractCitations(ctx, refs);
	progress(0.85, 'citations');
	signal?.throwIfAborted();
	const inBibliography = (page: number, offset: number) =>
		refs.references.some((r) =>
			r.ranges.some((g) => g.page === page && offset >= g.start && offset < g.end)
		);
	const figures = [
		...(await extractFigures(ctx, opts.imageBoxes ?? true, opts.imageBoxBudgetMs)),
		...extractEquations(ctx, inBibliography)
	];
	progress(0.95, 'figures');
	// Cross-references never overlap the bibliography or citations.
	const excluded = (page: number, offset: number) =>
		refs.references.some((r) =>
			r.ranges.some((g) => g.page === page && offset >= g.start && offset < g.end)
		) || citations.some((c) => c.page === page && offset >= c.start && offset < c.end);
	const crossRefs = extractCrossRefs(ctx, links, figures, sections, excluded);
	progress(1, 'done');

	return {
		meta,
		sections,
		references: refs.references,
		citations,
		figures,
		crossRefs,
		links,
		citationStyle: refs.style,
		bodyFontSize: ctx.body,
		timeMs: Math.round(performance.now() - t0)
	};
}
