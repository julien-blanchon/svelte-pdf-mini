import type { Reference } from '../../core/paper/types.js';
import type { MetadataState } from '../../state/paper.svelte.js';

/** What the default citation card shows for a reference: enrichment first, parsed text as fallback. */
export interface ReferenceView {
	title: string;
	authors: string[];
	year?: number;
	venue?: string;
	/** One-sentence summary, else the abstract. */
	summary?: string;
	citationCount?: number;
	arxivUrl?: string;
	doiUrl?: string;
	loading: boolean;
}

export function referenceView(r: Reference, metadata: MetadataState | undefined): ReferenceView {
	const data = metadata?.status === 'done' ? metadata.data : null;
	const { parsed } = r;
	return {
		title: data?.title ?? parsed.title ?? r.raw,
		authors: data?.authors ?? parsed.authors,
		year: data?.year ?? parsed.year,
		venue: data?.venue ?? parsed.venue,
		summary: data?.tldr || data?.abstract || undefined,
		citationCount: data?.citationCount ?? undefined,
		arxivUrl:
			data?.urls.arxiv ?? (parsed.arxivId ? `https://arxiv.org/abs/${parsed.arxivId}` : undefined),
		doiUrl: data?.urls.doi ?? (parsed.doi ? `https://doi.org/${parsed.doi}` : undefined),
		loading: metadata?.status === 'loading'
	};
}

/** "A, B, C et al." with at most `max` names. */
export function formatAuthors(authors: string[], max: number): string {
	const names = authors.slice(0, max).join(', ');
	return authors.length > max ? `${names} et al.` : names;
}

/** 'auto' lists small groups ([1,2,3]) and pages through big ones ([3–12]). */
export function resolveLayout(layout: 'auto' | 'list' | 'pager', count: number): 'list' | 'pager' {
	if (layout !== 'auto') return layout;
	return count > 1 && count <= 4 ? 'list' : 'pager';
}
