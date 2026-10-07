import type { InkSmoothing } from '../../core/annotations/stroke.js';
import type { Snippet } from 'svelte';
import type { PaletteColor } from '../../core/annotations/colors.js';
import type {
	Annotation,
	AnnotationOp,
	Author,
	FreeTextFontFamily,
	TextMarkupKind
} from '../../core/annotations/model.js';
import type { ButtonPartProps, DivPartProps } from '../../internal/component-types.js';
import type {
	AnnotationStore,
	AnnotationTool,
	ForeignPolicy
} from '../../state/annotations.svelte.js';
import type { ImportResult } from '../../core/pdf-codec/index.js';
import type { Keymap } from '../../core/i18n/keymap.js';

/** Which side of the page a margin part sits on. */
export type PageSide = 'left' | 'right';
/** How existing annotations are picked for editing. */
export type SelectOn = 'click' | 'dblclick';
/** `Annotations.Margin` layout: full notes, compact markers, or chosen from the room. */
export type MarginLayout = 'auto' | 'notes' | 'markers';
/** `Annotations.Comment` mode: 'auto' edits while open (or empty) and renders otherwise. */
export type CommentMode = 'auto' | 'edit' | 'view';
/** Placement of a floating part relative to its anchor. */
export type FloatingPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface AnnotationsRootProps {
	/** The annotations. Bindable (or pass a value + onAnnotationsChange). */
	annotations?: Annotation[];
	/** After each change (one call per undo step): persist here. */
	onAnnotationsChange?: (annotations: Annotation[], ops: AnnotationOp[]) => void;
	/** Active tool. Bindable. */
	tool?: AnnotationTool;
	onToolChange?: (tool: AnnotationTool) => void;
	/** Active palette key. Bindable. */
	color?: string;
	onColorChange?: (color: string) => void;
	/** Palette (bindable): custom colors picked by users are appended to it. */
	palette?: PaletteColor[];
	onPaletteChange?: (palette: PaletteColor[]) => void;
	/**
	 * Emoji notes can show instead of the icon (e.g. `defaultNoteEmojis`): keys
	 * 1–8 pick one while the note tool is active. Default: none.
	 */
	noteEmojis?: readonly string[];
	/** Active note emoji (one of `noteEmojis`; default the first). Bindable. */
	noteEmoji?: string;
	onNoteEmojiChange?: (emoji: string | undefined) => void;
	/** Show annotations (also `store.annotationsVisible`). */
	annotationsVisible?: boolean;
	/** Show side notes and gutter markers (also `store.notesVisible`). */
	notesVisible?: boolean;
	/** Only show these palette keys (null = all; also `store.colorFilter`). */
	colorFilter?: string[] | null;
	author?: Author;
	readonly?: boolean;
	/** Annotations that came from the PDF: 'editable' | 'readonly' | 'hidden'. */
	foreign?: ForeignPolicy;
	/** Keep the tool after creating (highlighter sessions). Default false: back to select (Shift keeps it once). */
	stickyTools?: boolean;
	/** Tools (and text markups) offered. Default: all. Others get no shortcut or menu entry. */
	tools?: readonly AnnotationTool[];
	/** How existing annotations are picked for editing. Default 'dblclick'. */
	selectOn?: SelectOn;
	/** Open the note of a new annotation for typing (Enter keeps, Esc discards). Default true. */
	editOnCreate?: boolean;
	/** Pen stroke smoothing: 'smooth' (default), 'steady', 'pen' (variable width) or 'raw'. */
	inkSmoothing?: InkSmoothing;
	/** Font family of new text boxes: 'Handwritten', 'Helvetica' (sans, default), 'Times' (serif) or 'Courier' (mono). */
	freetextFont?: FreeTextFontFamily;
	/** Keyboard shortcuts, merged over `defaultKeymap`. */
	keymap?: Partial<Keymap>;
	/** Load the annotations stored in the PDF (ours losslessly, others per `foreign`). */
	importFromPdf?: boolean;
	onImport?: (result: ImportResult) => void;
	/** Re-anchor highlights to their quoted text when a document loads (e.g. a newer version of the paper). */
	reanchor?: boolean;
	/** The store (bind:store to use it outside). */
	store?: AnnotationStore;
	children?: Snippet<[{ store: AnnotationStore }]>;
}

export interface AnnotationSnippetProps {
	annotation: Annotation;
	selected: boolean;
	hovered: boolean;
	editable: boolean;
	/** CSS color for the current page theme. */
	color: string;
	/** A note's emoji (shown instead of its icon), if any. */
	emoji: string | undefined;
}

export type AnnotationsLayerProps = DivPartProps<{
	/** Custom note icon. */
	noteIcon?: Snippet<[AnnotationSnippetProps]>;
	/** Custom label chip for area boxes. */
	areaLabel?: Snippet<[AnnotationSnippetProps]>;
}>;

/** Shared by every floating part: transitions via `forceMount` + `open`, and open-state callbacks. */
interface FloatingProps {
	/** Keep rendering `child` while closed (with `open: false`) so you can run exit transitions. */
	forceMount?: boolean;
	onOpenChange?: (open: boolean) => void;
	placement?: FloatingPlacement;
}

export interface SelectionMenuSnippetProps {
	open: boolean;
	text: string;
	markup: (kind?: TextMarkupKind, color?: string) => Annotation[];
	comment: () => void;
	copy: () => void;
	close: () => void;
}
export type AnnotationsSelectionMenuProps = DivPartProps<FloatingProps, SelectionMenuSnippetProps>;

export interface PopoverSnippetProps extends AnnotationSnippetProps {
	open: boolean;
	remove: () => void;
	close: () => void;
}
export type AnnotationsPopoverProps = DivPartProps<
	FloatingProps & {
		/** Repeat the quoted text inside the popover. Default false (it is right there on the page). */
		showQuote?: boolean;
	},
	PopoverSnippetProps
>;
export type AnnotationsHoverCardProps = DivPartProps<
	FloatingProps & { delay?: number },
	AnnotationSnippetProps & { open: boolean }
>;
export interface MarginNoteSnippetProps extends AnnotationSnippetProps {
	/** Its comment is being edited. */
	editing: boolean;
}
export type AnnotationsMarginProps = DivPartProps<{
	/** Which annotations get a side note. Default: those with a comment or a label. */
	filter?: (a: Annotation) => boolean;
	/** Gap between notes (px). Default 8. */
	gap?: number;
	side?: PageSide;
	/**
	 * Notes never overflow the view: they shrink to the room beside the page
	 * (`viewer.sideRoom`) plus the page's blank margin (they cover it, never
	 * its text, when the view is tight), and below this width (px) turn into
	 * compact markers that show the note on hover and open it on click. Default 140.
	 */
	minWidth?: number;
	/**
	 * Space (px) notes keep from the edge of the view, e.g. to clear a
	 * `Toc.Rail` laid over it. Default 8.
	 */
	edge?: number;
	/** Force a layout instead of adapting to the room. Default 'auto'. */
	layout?: MarginLayout;
	note?: Snippet<[MarginNoteSnippetProps]>;
}>;
export type AnnotationsLineMarkersProps = DivPartProps<{
	/** 'notes' (default): annotations with a note or label; 'all': every annotation. */
	markers?: 'notes' | 'all';
	/** Custom filter (overrides `markers`). */
	filter?: (a: Annotation) => boolean;
	side?: PageSide;
}>;
export interface ListItemSnippetProps extends AnnotationSnippetProps {
	/** Quoted text (or a text box's text), '' if none. */
	quote: string;
	pageLabel: string;
	/** Select the annotation and scroll to it. */
	go: () => void;
}
export type AnnotationsListProps = DivPartProps<
	{
		filter?: (a: Annotation) => boolean;
		item?: Snippet<[ListItemSnippetProps]>;
		empty?: Snippet;
	},
	{ annotations: Annotation[] }
>;
export type AnnotationsToolProps = ButtonPartProps<{ tool: AnnotationTool }, { active: boolean }>;
export type AnnotationsColorProps = ButtonPartProps<
	{ color: string },
	{ active: boolean; swatch: PaletteColor | undefined }
>;
export type AnnotationsNoteEmojiProps = ButtonPartProps<{ emoji: string }, { active: boolean }>;
export type AnnotationsHistoryButtonProps = ButtonPartProps<
	Record<never, never>,
	{ disabled: boolean }
>;
export type AnnotationsCommentProps = DivPartProps<{
	annotation: Annotation;
	placeholder?: string;
	autofocus?: boolean;
	/** 'auto' (default): textarea while editing, rendered Markdown + maths otherwise. */
	mode?: CommentMode;
}>;
export type AnnotationsCropProps = DivPartProps<{
	annotation: Annotation;
	width?: number;
	padding?: number;
}>;
