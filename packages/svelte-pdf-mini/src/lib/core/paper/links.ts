/** Classify link annotations by their hyperref destination name (or target). */
import type { DocContext } from './context.js';
import { inBibliographyRegion, type BibliographyRegion } from './references.js';
import type { LinkKind, PaperLink } from './types.js';

const PREFIX: [RegExp, LinkKind][] = [
	[/^cite\./, 'citation'],
	[/^(section|subsection|subsubsection|paragraph|chapter|part|appendix|section\*)\./, 'section'],
	[/^figure\./, 'figure'],
	[/^(table|subtable)\./, 'table'],
	[/^(equation|eq|AMS)\./, 'equation'],
	[/^(Hfootnote|footnote)\./, 'footnote'],
	[/^page\./, 'page'],
	[/^(algorithm|algocf|alg)\./, 'algorithm'],
	[/^(theorem|lemma|corollary|proposition|definition|remark|example|tcb@cnt@)/, 'theorem']
];

export function kindOfDest(dest: string): LinkKind {
	for (const [re, kind] of PREFIX) if (re.test(dest)) return kind;
	return 'other';
}

export async function classifyLinks(
	ctx: DocContext,
	region: BibliographyRegion | null
): Promise<PaperLink[]> {
	const out: PaperLink[] = [];
	for (let p = 1; p <= ctx.numPages; p++) {
		for (const link of ctx.links[p - 1]) {
			if (link.url) {
				out.push({ page: p, rect: link.rect, url: link.url, kind: 'url' });
				continue;
			}
			if (!link.dest) continue;
			const target = (await ctx.resolve(link.dest)) ?? undefined;
			let kind: LinkKind = typeof link.dest === 'string' ? kindOfDest(link.dest) : 'other';
			// Explicit (unnamed) destinations into the bibliography are citations.
			if (kind === 'other' && target && region && inBibliographyRegion(target, region))
				kind = 'citation';
			out.push({ page: p, rect: link.rect, dest: link.dest, kind, target });
		}
	}
	return out;
}
