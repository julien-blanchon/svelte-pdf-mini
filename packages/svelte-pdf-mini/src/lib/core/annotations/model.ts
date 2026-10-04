/**
 * The annotation model: plain, JSON-serialisable objects in PDF user space
 * (points, origin bottom-left, unrotated page). This is what the store holds,
 * what change events carry, and what the PDF codec reads and writes.
 */
import type { PdfPoint, PdfRect } from '../types.js';
import type { Quad } from '../text/text-index.js';

/** RGB, each channel 0..1 (like PDF /C). */
export type Rgb = [number, number, number];

export type TextMarkupKind = 'highlight' | 'underline' | 'strikeout' | 'squiggly';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'polyline';
export type AnnotationKind =
	TextMarkupKind | ShapeKind | 'note' | 'area' | 'ink' | 'freetext' | 'stamp';

export interface Author {
	name: string;
	id?: string;
	/** Display colour for avatars / thread UI (CSS colour). */
	color?: string;
}

/** W3C TextQuoteSelector + position: lets a markup re-anchor on another version of the PDF. */
export interface TextQuote {
	exact: string;
	prefix?: string;
	suffix?: string;
	/** Raw page-text offsets when created. */
	start?: number;
	end?: number;
}

export interface AnnotationBase {
	/** Unique id (UUID). Written as /NM. */
	id: string;
	/** 1-based page number. */
	page: number;
	kind: AnnotationKind;
	/** Bounding box in PDF space; always contains all geometry. */
	rect: PdfRect;
	/** Stroke / markup colour. */
	color: Rgb;
	/** 0..1 (PDF /CA). */
	opacity: number;
	/** Palette key ('yellow', 'sage'…) so themes can remap colours. */
	paletteKey?: string;
	/** Comment / side note (plain text or Markdown, see contentsFormat). */
	contents?: string;
	contentsFormat?: 'plain' | 'markdown';
	/** Short label, e.g. "Fig. 3" or "Key result" (shown as a chip on area boxes). */
	label?: string;
	/** Free tags for filtering. */
	tags?: string[];
	author?: Author;
	/** ISO 8601. */
	createdAt: string;
	modifiedAt: string;
	/** Reply threading: id of the annotation this replies to. */
	inReplyTo?: string;
	/** Cannot be edited or deleted from the UI. */
	locked?: boolean;
	hidden?: boolean;
	/** 'foreign' = imported from a PDF not written by svelte-pdf-mini. */
	origin?: 'local' | 'foreign';
	/** Host data, round-tripped losslessly. */
	extra?: Record<string, unknown>;
}

export interface TextMarkupAnnotation extends AnnotationBase {
	kind: TextMarkupKind;
	quads: Quad[];
	quote?: TextQuote;
}

export interface NoteAnnotation extends AnnotationBase {
	kind: 'note';
	/** Icon name (PDF /Name): Comment, Note, Key, Help, Insert, Paragraph… */
	icon?: string;
}

/** A box drawn around a region (figure, equation, table…), usually with a side note. */
export interface AreaAnnotation extends AnnotationBase {
	kind: 'area';
	/** Fill colour (defaults to `color`). */
	fill?: Rgb;
	/** Fill opacity 0..1 (border uses `opacity`). Default 0.12. */
	fillOpacity?: number;
	/** Border width in points. Default 1.5. */
	width?: number;
	/** Optional quote of the text inside the box. */
	quote?: TextQuote;
}

export interface InkPath {
	points: PdfPoint[];
	/** 0..1 per point (pen pressure). */
	pressure?: number[];
}

/** perfect-freehand options (see https://github.com/steveruizok/perfect-freehand). */
export interface FreehandOptions {
	/** How much pressure narrows the stroke (-1..1). Default 0.55. */
	thinning?: number;
	/** Edge softening (0..1). Default 0.5. */
	smoothing?: number;
	/** Point stabilisation (0..1). Default 0.5. */
	streamline?: number;
	/** Fake pressure from speed when the device reports none. Default true. */
	simulatePressure?: boolean;
	/** Taper length at the start/end in points (0 = none, true = full). */
	taperStart?: number | boolean;
	taperEnd?: number | boolean;
}

export interface InkAnnotation extends AnnotationBase {
	kind: 'ink';
	paths: InkPath[];
	/** Stroke width in points (the nominal width for freehand strokes). */
	width: number;
	/**
	 * 'freehand' (default for new strokes): a filled, pressure-sensitive outline
	 * (perfect-freehand), like tldraw / excalidraw. 'line': a plain stroked path.
	 */
	style?: 'freehand' | 'line';
	freehand?: FreehandOptions;
}

export type LineEnding =
	'none' | 'open-arrow' | 'closed-arrow' | 'circle' | 'square' | 'diamond' | 'butt';

export interface ShapeAnnotation extends AnnotationBase {
	kind: ShapeKind;
	/** Stroke width in points. */
	width: number;
	fill?: Rgb;
	fillOpacity?: number;
	dash?: number[];
	/** line/arrow: 2 points; polygon/polyline: n points. rect/ellipse use `rect`. */
	points?: PdfPoint[];
	lineEndings?: [LineEnding, LineEnding];
}

export interface FreeTextAnnotation extends AnnotationBase {
	kind: 'freetext';
	text: string;
	font: {
		family: 'Helvetica' | 'Times' | 'Courier';
		size: number;
		bold?: boolean;
		italic?: boolean;
	};
	align?: 'left' | 'center' | 'right';
	/** Text colour (`color` is the border). */
	textColor?: Rgb;
	fill?: Rgb;
}

export interface StampAnnotation extends AnnotationBase {
	kind: 'stamp';
	/** Standard stamp name (Approved, Draft…) or a custom label. */
	name?: string;
	/** Image as a data URL (PNG/JPEG). */
	image?: string;
}

export type Annotation =
	| TextMarkupAnnotation
	| NoteAnnotation
	| AreaAnnotation
	| InkAnnotation
	| ShapeAnnotation
	| FreeTextAnnotation
	| StampAnnotation;

type Narrow<A, K> = A extends { kind: infer AK } ? (K extends AK ? A : never) : never;

/** The annotation type for a kind: `AnnotationOf<'ink'>` → InkAnnotation, `AnnotationOf<'arrow'>` → ShapeAnnotation. */
export type AnnotationOf<K extends AnnotationKind> = Narrow<Annotation, K>;

type AllFields = Partial<Omit<TextMarkupAnnotation, 'kind'>> &
	Partial<Omit<NoteAnnotation, 'kind'>> &
	Partial<Omit<AreaAnnotation, 'kind' | 'quote'>> &
	Partial<Omit<InkAnnotation, 'kind' | 'width'>> &
	Partial<Omit<ShapeAnnotation, 'kind' | 'fill' | 'fillOpacity'>> &
	Partial<Omit<FreeTextAnnotation, 'kind' | 'fill'>> &
	Partial<Omit<StampAnnotation, 'kind'>>;

/** A partial update for any annotation (fields of every kind are allowed; irrelevant ones are ignored). */
export type AnnotationPatch = AllFields & {
	kind?: AnnotationKind;
	width?: number;
	fill?: Rgb;
	fillOpacity?: number;
};

/** Fields accepted when creating an annotation of kind K (ids, dates, colour and author are filled in). */
export type AnnotationInit<K extends AnnotationKind> = Partial<Omit<AnnotationOf<K>, 'kind'>> &
	Pick<AnnotationBase, 'page' | 'rect'>;

/** A change, as emitted by the store (also used for undo/redo). */
export type AnnotationOp =
	| { type: 'add'; annotation: Annotation }
	| { type: 'update'; id: string; before: Annotation; after: Annotation }
	| { type: 'remove'; annotation: Annotation };

export const TEXT_MARKUP_KINDS: readonly TextMarkupKind[] = [
	'highlight',
	'underline',
	'strikeout',
	'squiggly'
];
export const SHAPE_KINDS: readonly ShapeKind[] = [
	'rect',
	'ellipse',
	'line',
	'arrow',
	'polygon',
	'polyline'
];

export function isTextMarkupKind(kind: string): kind is TextMarkupKind {
	return (TEXT_MARKUP_KINDS as readonly string[]).includes(kind);
}
export function isTextMarkup(a: Annotation): a is TextMarkupAnnotation {
	return isTextMarkupKind(a.kind);
}
export function isShape(a: Annotation): a is ShapeAnnotation {
	return (SHAPE_KINDS as readonly string[]).includes(a.kind);
}

/** Version of the JSON schema (bump on breaking model changes). */
export const ANNOTATION_SCHEMA_VERSION = 1;
