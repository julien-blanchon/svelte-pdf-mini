/**
 * Research-paper model produced by `analyzePaper()`. All geometry is PDF user
 * space (points, origin bottom-left, unrotated); pages are 1-based; text
 * offsets are raw `PageText` offsets.
 */
import type { PdfPoint, PdfRect } from '../types.js';
import type { PageText, Quad } from '../text/text-index.js';

/** Minimal outline node (pdf.js `getOutline()` shape). */
export interface OutlineNodeLike {
	title: string;
	dest?: string | unknown[] | null;
	url?: string | null;
	items?: OutlineNodeLike[];
}

export interface LinkLike {
	rect: PdfRect;
	dest?: string | unknown[] | null;
	url?: string | null;
}

export interface ResolvedTarget {
	page: number;
	point?: PdfPoint;
	rect?: PdfRect;
}

/** Everything the analyser needs from a document (pdf.js adapter: `pdfjsPaperSource`). */
export interface PaperSource {
	numPages: number;
	getPageText(page: number): Promise<PageText>;
	getLinks(page: number): Promise<LinkLike[]>;
	getOutline(): Promise<OutlineNodeLike[] | null>;
	resolveDest(dest: string | unknown[]): Promise<ResolvedTarget | null>;
	/** Bounding boxes of raster images on a page (optional, improves figure boxes). */
	getImageBoxes?(page: number): Promise<PdfRect[]>;
	/** Images, table rules and vector drawings on a page (better figure/table boxes). */
	getGraphics?(page: number): Promise<{ images: PdfRect[]; rules: PdfRect[]; drawings: PdfRect[] }>;
	pageSize(page: number): { width: number; height: number };
}

export interface PaperMeta {
	title?: string;
	authors: string[];
	abstract?: string;
	arxivId?: string;
	doi?: string;
}

export interface Section {
	id: string;
	/** "3", "3.2", "A", "B.1" when known. */
	number?: string;
	title: string;
	/** 1 = top level. */
	level: number;
	page: number;
	/** PDF y of the heading top (larger = higher on the page). */
	y: number;
	rect?: PdfRect;
	/** Last page belonging to this section (before the next section at the same or a higher level). */
	endPage: number;
	/** PDF y where the section ends on `endPage` (top of the next heading), or 0 for page bottom. */
	endY: number;
	kind?: 'abstract' | 'references' | 'appendix' | 'section';
	/** Named destination it came from (outline / hyperref). */
	dest?: string;
	source: 'outline' | 'text';
	children: Section[];
}

export interface ParsedReference {
	authors: string[];
	/** Family names, for author-year matching. */
	surnames: string[];
	year?: number;
	/** Suffix in "2017a". */
	yearSuffix?: string;
	title?: string;
	venue?: string;
	doi?: string;
	arxivId?: string;
	url?: string;
}

export interface Reference {
	id: string;
	/** 1-based position in the bibliography. */
	index: number;
	/** "[12]", "[BMR+20]" or "Vaswani et al., 2017". */
	label: string;
	/** Bracket key without brackets ("12", "BMR+20") when the style uses one. */
	key?: string;
	raw: string;
	page: number;
	/** Box of the entry on its first page. */
	rect: PdfRect;
	quads: Quad[];
	/** Raw text ranges (entries may continue on the next page). */
	ranges: { page: number; start: number; end: number }[];
	/** Named destinations pointing at this entry (cite.*). */
	dests: string[];
	parsed: ParsedReference;
}

export interface InTextCitation {
	id: string;
	page: number;
	start: number;
	end: number;
	text: string;
	quads: Quad[];
	rect: PdfRect;
	referenceIds: string[];
	source: 'link' | 'text';
}

/** `equation`: a numbered display equation ("… (3)"). */
export type FigureKind = 'figure' | 'table' | 'algorithm' | 'equation';

export interface Figure {
	id: string;
	kind: FigureKind;
	/** "3", "1.2", "A.1". */
	number: string;
	label: string;
	caption: string;
	page: number;
	captionRect: PdfRect;
	/** Box of the label itself ("Figure 3", or an equation's "(3)"), for hover targets. */
	labelRect?: PdfRect;
	/** Box of the figure/table body (best effort), including the caption. */
	rect: PdfRect;
	dest?: string;
	source: 'images' | 'layout';
}

export type CrossRefKind =
	| 'figure'
	| 'table'
	| 'algorithm'
	| 'section'
	| 'equation'
	| 'appendix'
	| 'footnote'
	| 'theorem'
	| 'page';

export interface CrossRef {
	id: string;
	page: number;
	start: number;
	end: number;
	text: string;
	quads: Quad[];
	rect: PdfRect;
	kind: CrossRefKind;
	/** Figure id / section id when resolved. */
	targetId?: string;
	/** Where it points (always set when resolvable). */
	target?: ResolvedTarget;
	dest?: string | unknown[];
	source: 'link' | 'text';
}

export type LinkKind =
	| 'citation'
	| 'section'
	| 'figure'
	| 'table'
	| 'equation'
	| 'footnote'
	| 'page'
	| 'algorithm'
	| 'theorem'
	| 'other'
	| 'url';

export interface PaperLink {
	page: number;
	rect: PdfRect;
	dest?: string | unknown[];
	url?: string;
	kind: LinkKind;
	target?: ResolvedTarget;
}

export interface PaperModel {
	meta: PaperMeta;
	sections: Section[];
	references: Reference[];
	citations: InTextCitation[];
	figures: Figure[];
	crossRefs: CrossRef[];
	links: PaperLink[];
	/** Citation style detected in the bibliography. */
	citationStyle: 'numeric' | 'alpha' | 'author-year' | 'unknown';
	/** Median body font size in points. */
	bodyFontSize: number;
	/** Analysis time in ms. */
	timeMs: number;
}

export interface AnalyzeOptions {
	signal?: AbortSignal;
	onProgress?: (fraction: number, stage: string) => void;
	/** Compute image boxes for figure pages (needs `getImageBoxes`). Default true. */
	imageBoxes?: boolean;
	/** Time budget for image boxes in ms (layout analysis after that). Default 2500. */
	imageBoxBudgetMs?: number;
}
