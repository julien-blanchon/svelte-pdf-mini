/**
 * Plain-text exports of the annotation model: versioned JSON (lossless) and
 * a Markdown summary grouped by section (or page).
 */
import type { Annotation } from '../annotations/model.js';
import { ANNOTATION_SCHEMA_VERSION, isTextMarkup } from '../annotations/model.js';
import { defaultPalette } from '../annotations/colors.js';
import { GENERATOR } from './shared.js';

export interface AnnotationsJson {
	schema: number;
	generator: string;
	exportedAt: string;
	annotations: Annotation[];
	[meta: string]: unknown;
}

const KINDS = new Set([
	'highlight',
	'underline',
	'strikeout',
	'squiggly',
	'note',
	'area',
	'ink',
	'rect',
	'ellipse',
	'line',
	'arrow',
	'polygon',
	'polyline',
	'freetext',
	'stamp'
]);

/** Serialise annotations (plus optional metadata such as the document fingerprint). */
export function annotationsToJSON(list: Annotation[], meta: Record<string, unknown> = {}): string {
	const doc: AnnotationsJson = {
		...meta,
		schema: ANNOTATION_SCHEMA_VERSION,
		generator: GENERATOR,
		exportedAt: new Date().toISOString(),
		annotations: list
	};
	return JSON.stringify(doc, null, '\t');
}

/** Parse and validate annotations JSON (string or object). Throws on unknown schema versions. */
export function annotationsFromJSON(
	json: string | AnnotationsJson | { annotations: unknown[] }
): Annotation[] {
	const doc = typeof json === 'string' ? JSON.parse(json) : json;
	const list: unknown[] = Array.isArray(doc) ? doc : doc?.annotations;
	if (!Array.isArray(list)) throw new Error('svelte-pdf-mini: no annotations array in JSON');
	if (typeof doc?.schema === 'number' && doc.schema > ANNOTATION_SCHEMA_VERSION) {
		throw new Error(
			`svelte-pdf-mini: annotations schema ${doc.schema} is newer than supported (${ANNOTATION_SCHEMA_VERSION})`
		);
	}
	return list.filter((a): a is Annotation => {
		if (!a || typeof a !== 'object') return false;
		const x = a as Partial<Annotation>;
		return (
			typeof x.id === 'string' &&
			typeof x.page === 'number' &&
			typeof x.kind === 'string' &&
			KINDS.has(x.kind) &&
			Array.isArray(x.rect) &&
			Array.isArray(x.color)
		);
	});
}

export interface MarkdownOptions {
	title?: string;
	/** Sections (e.g. from the outline), each starting at (page, y) in PDF space. */
	sections?: { title: string; page: number; y: number }[];
	/** Page label (e.g. roman numerals); default the page number. */
	pageLabel?: (page: number) => string;
	/** Colour names (palette key → label). */
	palette?: { key: string; label: string }[];
}

const KIND_LABEL: Record<Annotation['kind'], string> = {
	highlight: 'Highlight',
	underline: 'Underline',
	strikeout: 'Strike-out',
	squiggly: 'Squiggly',
	note: 'Note',
	area: 'Area',
	ink: 'Drawing',
	rect: 'Rectangle',
	ellipse: 'Ellipse',
	line: 'Line',
	arrow: 'Arrow',
	polygon: 'Polygon',
	polyline: 'Polyline',
	freetext: 'Text',
	stamp: 'Stamp'
};

/** The text an annotation is about: the quoted passage, or a text box's own text. */
function quotedText(a: Annotation): string {
	if ((isTextMarkup(a) || a.kind === 'area') && a.quote?.exact) return a.quote.exact;
	if (a.kind === 'freetext') return a.text;
	return '';
}

/** Markdown summary: grouped by section (or page), reading order, quotes, comments and replies. */
export function annotationsToMarkdown(list: Annotation[], opts: MarkdownOptions = {}): string {
	const pageLabel = opts.pageLabel ?? ((p: number) => String(p));
	const palette = new Map((opts.palette ?? defaultPalette).map((c) => [c.key, c.label]));
	const top = (a: Annotation) => a.rect[3];
	const order = (a: Annotation, b: Annotation) =>
		a.page - b.page || top(b) - top(a) || a.rect[0] - b.rect[0];

	const replies = new Map<string, Annotation[]>();
	const roots: Annotation[] = [];
	for (const a of list) {
		if (a.hidden) continue;
		if (a.inReplyTo) replies.set(a.inReplyTo, [...(replies.get(a.inReplyTo) ?? []), a]);
		else roots.push(a);
	}
	roots.sort(order);

	const sections = [...(opts.sections ?? [])].sort((a, b) => a.page - b.page || b.y - a.y);
	const sectionOf = (a: Annotation) => {
		let found: string | null = null;
		for (const s of sections) {
			if (s.page < a.page || (s.page === a.page && s.y >= top(a) - 2)) found = s.title;
			else break;
		}
		return found;
	};

	const lines: string[] = [];
	if (opts.title) lines.push(`# ${opts.title}`, '');
	let group: string | null | undefined;
	for (const a of roots) {
		const g = sections.length ? (sectionOf(a) ?? 'Front matter') : `Page ${pageLabel(a.page)}`;
		if (g !== group) {
			group = g;
			lines.push(`## ${g}`, '');
		}
		const meta = [`p. ${pageLabel(a.page)}`, KIND_LABEL[a.kind]];
		const colour = a.paletteKey ? palette.get(a.paletteKey) : undefined;
		if (colour) meta.push(colour.toLowerCase());
		if (a.label) meta.push(`*${a.label}*`);
		if (a.author?.name) meta.push(a.author.name);
		lines.push(`- ${meta.join(' · ')}`);
		const quote = quotedText(a);
		if (quote) lines.push(...quote.split('\n').map((l) => `  > ${l}`));
		if (a.contents) lines.push('', ...a.contents.split('\n').map((l) => (l ? `  ${l}` : '')));
		const thread = (replies.get(a.id) ?? []).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
		for (const reply of thread) {
			const who = reply.author?.name ? `**${reply.author.name}:** ` : '';
			lines.push(`  - ↳ ${who}${(reply.contents ?? '').replace(/\n/g, ' ')}`);
		}
		lines.push('');
	}
	return lines.join('\n').trimEnd() + '\n';
}
