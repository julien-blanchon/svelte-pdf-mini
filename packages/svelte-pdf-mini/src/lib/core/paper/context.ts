/** Shared, per-document data the analysis stages work from. */
import type { PageText } from '../text/text-index.js';
import { bodyFont, bodyFontSize, pageLines, type Line } from './lines.js';
import type { LinkLike, PaperSource, ResolvedTarget } from './types.js';

export interface DocContext {
	src: PaperSource;
	numPages: number;
	texts: PageText[];
	/** lines[page - 1] */
	lines: Line[][];
	links: LinkLike[][];
	body: number;
	bodyFont: string;
	resolve(dest: string | unknown[] | null | undefined): Promise<ResolvedTarget | null>;
}

export async function buildContext(
	src: PaperSource,
	signal: AbortSignal | undefined,
	progress: (f: number) => void
): Promise<DocContext> {
	const texts: PageText[] = [];
	const links: LinkLike[][] = [];
	// Load pages in small batches (keeps the worker responsive and bounds memory).
	const batch = 8;
	for (let s = 1; s <= src.numPages; s += batch) {
		signal?.throwIfAborted();
		const pages = Array.from({ length: Math.min(batch, src.numPages - s + 1) }, (_, i) => s + i);
		const [t, l] = await Promise.all([
			Promise.all(pages.map((p) => src.getPageText(p))),
			Promise.all(pages.map((p) => src.getLinks(p).catch(() => [])))
		]);
		texts.push(...t);
		links.push(...l);
		progress((s + pages.length - 1) / src.numPages);
	}
	const lines = texts.map(pageLines);
	const all = lines.flat();
	const body = bodyFontSize(all);
	return {
		src,
		numPages: src.numPages,
		texts,
		lines,
		links,
		body,
		bodyFont: bodyFont(all, body),
		resolve: async (dest) => (dest ? src.resolveDest(dest) : null)
	};
}

/** Known section headings (case-insensitive, whole line, optional numbering). */
export const KNOWN_HEADINGS =
	/^(abstract|introduction|related work|related works|background|preliminaries|method|methods|methodology|approach|model|experiments?|experimental setup|evaluation|results|discussion|analysis|limitations|conclusions?|conclusions and future work|future work|acknowledge?ments?|references|bibliography|appendix|appendices|supplementary material)$/i;

export const REFERENCES_HEADING =
	/^(?:(?:\d+|[A-Z])\.?\s+)?(references|bibliography|literature cited|works cited|reference list)$/i;

/** "3", "3.2", "A", "A.1" + title. */
export const NUMBERED_HEADING =
	/^((?:\d{1,2}|[A-Z])(?:\.\d{1,2}){0,3})\.?\s+(\p{Lu}[^\n]{1,100})$/u;

/** Normalize heading text for comparisons. */
export const headingKey = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** Vertical anchor of a destination: its point, else its rect's top, else 0. */
export const targetY = (t: ResolvedTarget): number => t.point?.[1] ?? t.rect?.[3] ?? 0;

/** Like `targetY` but skips a non-finite point; undefined when nothing usable. */
export function finiteTargetY(t: ResolvedTarget): number | undefined {
	if (t.point && Number.isFinite(t.point[1])) return t.point[1];
	return t.rect?.[3];
}

/** Position ordering helper: (page, -y). */
export function before(aPage: number, aY: number, bPage: number, bY: number): boolean {
	return aPage < bPage || (aPage === bPage && aY > bY);
}
