import type { Snippet } from 'svelte';
import type {
	CrossRef,
	Figure,
	InTextCitation,
	PaperModel,
	Reference
} from '../../core/paper/types.js';
import type { CitationProvider } from '../../core/providers/types.js';
import type { DivPartProps } from '../../internal/component-types.js';
import type { MetadataState, PaperState } from '../../state/paper.svelte.js';

export interface PaperRootProps {
	/** Reference metadata provider (e.g. `defaultCitationProvider()`); optional. */
	provider?: CitationProvider | null;
	/** Analyse automatically on load. Default true. */
	auto?: boolean;
	onAnalyzed?: (model: PaperModel) => void;
	paper?: PaperState;
	children?: Snippet<[{ paper: PaperState }]>;
}

export type PaperLayerProps = DivPartProps<{
	citations?: boolean;
	crossRefs?: boolean;
	/** Replace the click action on an in-text citation. Return false to skip the default jump. */
	onCitationClick?: (
		citation: InTextCitation,
		references: Reference[],
		event: MouseEvent
	) => void | false;
	/** Replace the click action on "Fig. 3" / "Section 2" links. Return false to skip the default jump. */
	onCrossRefClick?: (crossRef: CrossRef, event: MouseEvent) => void | false;
}>;

/** Shared by every floating part: transitions via `forceMount` + `open`, and open-state callbacks. */
export interface FloatingProps {
	/** Keep rendering the `child` snippet while closed (with `open: false`) so you can run exit transitions. */
	forceMount?: boolean;
	onOpenChange?: (open: boolean) => void;
	placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface CitationCardSnippetProps {
	open: boolean;
	citation: InTextCitation;
	references: Reference[];
	/** Index of the reference shown in 'pager' layout. */
	index: number;
	reference: Reference;
	metadata: MetadataState | undefined;
	layout: 'pager' | 'list';
	next: () => void;
	prev: () => void;
	go: (reference?: Reference) => void;
}
export type PaperCitationCardProps = DivPartProps<
	FloatingProps & {
		delay?: number;
		/** Groups like [1,2,3]: 'list' shows all, 'pager' one at a time, 'auto' lists up to 4. Default 'auto'. */
		layout?: 'auto' | 'list' | 'pager';
		/** Replace the default "go to reference" (e.g. open or import the cited paper). Return false to skip the default. */
		onReferenceClick?: (
			reference: Reference,
			citation: InTextCitation,
			event?: Event
		) => void | false;
		/** Custom rendering of each reference (default card parts otherwise). */
		reference?: Snippet<
			[
				{
					reference: Reference;
					metadata: MetadataState | undefined;
					go: (e?: Event) => void;
					compact: boolean;
				}
			]
		>;
		/** Extra actions in each reference's footer (Save, Import, Open…). */
		actions?: Snippet<[{ reference: Reference; metadata: MetadataState | undefined }]>;
	},
	CitationCardSnippetProps
>;
export type PaperCrossRefPreviewProps = DivPartProps<
	FloatingProps & { width?: number; delay?: number },
	{ label: string; open: boolean; canvasProps?: Record<string | symbol, unknown> }
>;

export interface ReferenceItemSnippetProps {
	reference: Reference;
	citedCount: number;
	go: () => void;
	/** Jump to the next place this reference is cited (cycles). */
	nextCitation: () => void;
	metadata: MetadataState | undefined;
}
export type PaperReferencesProps = DivPartProps<
	{ item?: Snippet<[ReferenceItemSnippetProps]> },
	{ references: Reference[] }
>;
export type PaperFiguresProps = DivPartProps<
	{
		kinds?: Figure['kind'][];
		thumbnails?: boolean;
		thumbnailWidth?: number;
		item?: Snippet<[{ figure: Figure; go: () => void }]>;
	},
	{ figures: Figure[] }
>;
export type PaperHeadingsProps = DivPartProps<{
	/** Prefix for heading ids (id = prefix + section id). Default 'section-'. */
	idPrefix?: string;
	/** Heading level used for top-level sections. Default 2. */
	baseLevel?: number;
	/** Show the headings (debug); hidden from view but not from assistive tech by default. */
	visible?: boolean;
}>;
