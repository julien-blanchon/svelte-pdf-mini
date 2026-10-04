/**
 * "What is here?" — the context of a pointer position (or the keyboard focus)
 * in a viewer. Built for context menus, but useful for tooltips, command
 * palettes and custom gestures too.
 *
 * The viewer resolves the base (page, point, selection, link); stores add
 * their own facts through resolvers (annotations under the point, citation,
 * figure, section…).
 */
import type { Annotation } from '../core/annotations/model.js';
import type {
	CrossRef,
	Figure,
	InTextCitation,
	LinkKind,
	Reference,
	Section
} from '../core/paper/types.js';
import type { PdfPoint } from '../core/types.js';
import type { PageSelection } from './selection.svelte.js';

export interface PdfContext {
	/** How the context was requested. */
	source: 'pointer' | 'keyboard';
	clientX: number;
	clientY: number;
	/** Page under the pointer (null outside pages). */
	page: number | null;
	/** PDF-space point under the pointer. */
	point: PdfPoint | null;
	/** Current text selection (may be empty). */
	selection: PageSelection[];
	selectedText: string;
	/** Annotations under the point, innermost first (or the selected ones from the keyboard). */
	annotations: Annotation[];
	link?: { url?: string; dest?: unknown; kind: LinkKind };
	citation?: InTextCitation;
	references?: Reference[];
	crossRef?: CrossRef;
	figure?: Figure;
	section?: Section;
}

/** Adds facts to a context. May be async (e.g. waiting for page data). */
export type ContextResolver = (
	ctx: PdfContext
) => Partial<PdfContext> | void | Promise<Partial<PdfContext> | void>;

/** The most specific thing the context is about (drives which menu to show). */
export function contextKind(
	ctx: PdfContext
): 'selection' | 'annotation' | 'citation' | 'figure' | 'link' | 'page' | 'none' {
	if (ctx.selectedText.trim()) return 'selection';
	if (ctx.annotations.length) return 'annotation';
	if (ctx.citation) return 'citation';
	if (ctx.link) return 'link';
	if (ctx.figure) return 'figure';
	if (ctx.page) return 'page';
	return 'none';
}
