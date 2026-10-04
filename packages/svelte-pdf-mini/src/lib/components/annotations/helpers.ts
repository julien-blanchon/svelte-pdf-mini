import type { Annotation } from '../../core/annotations/model.js';
import type { AnnotationStore } from '../../state/annotations.svelte.js';
import { annotationCss } from './color.js';
import type { AnnotationSnippetProps } from './types.js';

/** CSS custom properties, for a typed `style` merged with `mergeProps`. */
export type CssVars = Record<`--${string}`, string | number>;

/** Has something to show in a side note or hover card: a comment or a label. */
export function hasNote(a: Annotation): boolean {
	return !!(a.contents?.trim() || a.label);
}

/** The quoted text of a markup (or the text of a text box), '' otherwise. */
export function quoteOf(a: Annotation): string {
	if ('quote' in a && a.quote?.exact) return a.quote.exact;
	if ('text' in a && a.text) return a.text;
	return '';
}

/** Short accessible description: `highlight: Label "quoted text", note: comment`. */
export function describeAnnotation(
	a: Annotation,
	max = 80,
	/** Formats the comment part (the `annotationNote` message). */
	note: (text: string) => string = (text) => `note: ${text}`
): string {
	let out: string = a.kind;
	if (a.label) out += `: ${a.label}`;
	if ('quote' in a && a.quote?.exact) out += ` "${a.quote.exact.slice(0, max)}"`;
	if (a.contents) out += `, ${note(a.contents.slice(0, max))}`;
	return out;
}

/** Selector of an annotation's rendered shape (`Annotations.Layer`). */
export function annotationSelector(id: string): string {
	return `[data-pdf-annotation="${CSS.escape(id)}"]`;
}

/** Mark an annotation hovered, anchoring the hover card on `anchor`. */
export function hoverAnnotation(store: AnnotationStore, id: string, anchor: Element | null): void {
	store.hoveredId = id;
	store.hoverAnchor = anchor;
}

/** Clear the hover, unless another annotation took it meanwhile. */
export function unhoverAnnotation(store: AnnotationStore, id: string): void {
	if (store.hoveredId === id) store.hoveredId = null;
}

/** CSS colour of an annotation for the store's current page theme. */
export function themedColor(store: AnnotationStore, a: Annotation): string {
	return annotationCss(a, store.palette, !!store.viewer.pageTheme.dark);
}

/** The props every annotation snippet receives. `color` defaults to the themed colour. */
export function snippetPropsFor(
	store: AnnotationStore,
	a: Annotation,
	color = themedColor(store, a)
): AnnotationSnippetProps {
	return {
		annotation: a,
		selected: store.isSelected(a.id),
		hovered: store.hoveredId === a.id,
		editable: store.canEdit(a),
		color
	};
}
