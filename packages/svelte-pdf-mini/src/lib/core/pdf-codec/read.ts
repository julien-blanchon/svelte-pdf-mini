/**
 * Import: read annotations from any PDF into the model.
 *
 * Our own annotations are rebuilt exactly (embedded JSON, else /SPM_Data),
 * except where another app edited them after us (newer /M): then the standard
 * fields (colour, opacity, contents, geometry) win. If a re-serialiser dropped
 * /NM and /SPM_Data (Apple Preview can), annotations are matched back to the
 * embedded model by page, kind and geometry. Everything else is mapped to the
 * closest kind with `origin: 'foreign'`.
 */
import type { PDFDict, PDFRef } from '@cantoo/pdf-lib';
import type { PdfPoint, PdfRect } from '../types.js';
import type { Quad } from '../text/text-index.js';
import { quadsBounds } from '../text/text-index.js';
import type { Annotation, AnnotationKind, LineEnding, Rgb } from '../annotations/model.js';
import { isTextMarkup } from '../annotations/model.js';
import { nearestPaletteKey } from '../annotations/colors.js';
import { makeReaders, readEmbeddedModel, type Readers } from './pdf-objects.js';
import {
	AnnotFlag,
	PRIVATE_KEY,
	clone,
	alignFromQuadding,
	colorFromArray,
	fontFamilyOf,
	fromPdfDate,
	loadPdfLib,
	normalizeQuad,
	toBytes
} from './shared.js';
import { writtenRect } from './write.js';

export interface ImportOptions {
	/** Include annotations not written by svelte-pdf-mini. Default true. */
	foreign?: boolean;
	/** Text under markup quads (to fill `quote` on foreign highlights). */
	textOf?: (page: number, quads: Quad[]) => string | Promise<string>;
}

export interface ImportResult {
	annotations: Annotation[];
	/** How many imported annotations are foreign. */
	foreign: number;
	/** Annotations of types we don't import (links, form fields, attachments…). */
	unsupported: number;
	warnings: string[];
}

const SUPPORTED = new Set([
	'Highlight',
	'Underline',
	'StrikeOut',
	'Squiggly',
	'Text',
	'Square',
	'Circle',
	'Line',
	'Polygon',
	'PolyLine',
	'Ink',
	'FreeText',
	'Stamp'
]);
const IGNORED = new Set(['Popup']);

const ENDING_FROM_PDF: Record<string, LineEnding> = {
	None: 'none',
	OpenArrow: 'open-arrow',
	ClosedArrow: 'closed-arrow',
	ROpenArrow: 'open-arrow',
	RClosedArrow: 'closed-arrow',
	Circle: 'circle',
	Square: 'square',
	Diamond: 'diamond',
	Butt: 'butt',
	Slash: 'butt'
};

const DEFAULT_COLOR: Partial<Record<AnnotationKind, Rgb>> = {
	highlight: [1, 0.85, 0.3],
	note: [1, 0.85, 0.3]
};

export async function importAnnotations(
	input: Uint8Array | ArrayBuffer,
	opts: ImportOptions = {}
): Promise<ImportResult> {
	const lib = await loadPdfLib();
	const doc = await lib.PDFDocument.load(toBytes(input), {
		updateMetadata: false,
		ignoreEncryption: true
	});
	const r = makeReaders(lib, doc.context);
	const stored = readEmbeddedModel(doc);
	const used = new Set<string>();
	const out: Annotation[] = [];
	const warnings: string[] = [];
	const refToId = new Map<string, string>();
	const pendingReplies: [Annotation, PDFRef][] = [];
	let foreign = 0;
	let unsupported = 0;

	const pages = doc.getPages();
	for (let pi = 0; pi < pages.length; pi++) {
		const annots = pages[pi].node.Annots();
		if (!annots) continue;
		for (const entry of annots.asArray()) {
			const dict = r.dictOf(entry);
			if (!dict) continue;
			const subtype = r.name(dict, 'Subtype') ?? '';
			if (IGNORED.has(subtype)) continue;
			if (!SUPPORTED.has(subtype)) {
				unsupported++;
				continue;
			}
			const ref = entry instanceof lib.PDFRef ? entry : undefined;
			const std = mapStandard(r, dict, subtype, pi + 1, ref);
			if (!std) {
				warnings.push(`page ${pi + 1}: could not read ${subtype} annotation`);
				continue;
			}
			const nm = r.text(dict, 'NM');
			const priv = parsePrivate(r.text(dict, PRIVATE_KEY));

			let a: Annotation | null = null;
			const privId = typeof priv?.id === 'string' ? priv.id : undefined;
			const storedHit: Annotation | null =
				(nm && stored.get(nm)) || (privId && stored.get(privId)) || null;
			if (storedHit) a = clone(storedHit);
			else if (priv) a = fromPrivate(std, priv);
			else if (stored.size) {
				const match = findByGeometry(stored, used, std);
				if (match) a = clone(match);
			}

			if (a) {
				used.add(a.id);
				a.page = pi + 1;
				// Another app may have edited it after us: standard fields that are present and differ win.
				a = reconcile(a, std, fromPdfDate(r.text(dict, 'M')));
			} else {
				if (opts.foreign === false) continue;
				a = std;
				foreign++;
				if (opts.textOf && isTextMarkup(a) && a.quads.length) {
					try {
						const exact = (await opts.textOf(a.page, a.quads)).trim();
						if (exact) a.quote = { exact };
					} catch (err) {
						warnings.push(`page ${a.page}: textOf failed (${String(err)})`);
					}
				}
				const irt = r.refOf(dict, 'IRT');
				if (irt) pendingReplies.push([a, irt]);
			}
			if (ref) refToId.set(refKey(ref), a.id);
			out.push(a);
		}
	}
	for (const [a, irt] of pendingReplies) {
		const parent = refToId.get(refKey(irt));
		if (parent) a.inReplyTo = parent;
	}
	return { annotations: out, foreign, unsupported, warnings };
}

const refKey = (ref: PDFRef) => `${ref.objectNumber}-${ref.generationNumber}`;

function parsePrivate(json: string | undefined): Record<string, unknown> | null {
	if (!json) return null;
	try {
		const v = JSON.parse(json);
		return v && typeof v === 'object' ? v : null;
	} catch {
		return null;
	}
}

/** Rebuild from /SPM_Data (which holds the whole model except the page). */
function fromPrivate(std: Annotation, priv: Record<string, unknown>): Annotation {
	const { v: _v, ...rest } = priv;
	return {
		color: std.color,
		opacity: std.opacity,
		rect: std.rect,
		...rest,
		page: std.page
	} as Annotation;
}

/** What the standard dict actually carried (absent keys must not override the stored model). */
interface StandardMeta {
	hasCA: boolean;
	hasC: boolean;
	/** Quads came from /QuadPoints (not synthesised from /Rect). */
	realQuads: boolean;
}
const stdMeta = new WeakMap<Annotation, StandardMeta>();

const near = (a: number[], b: number[], tol: number) =>
	a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const sameText = (a: string | undefined, b: string | undefined) =>
	(a ?? '').replace(/\r\n?/g, '\n').trim() === (b ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * Field-level merge of a stored annotation with what the PDF says now. A
 * standard field wins when it is present and differs (the user edited it in
 * Preview, Acrobat…); missing fields keep the stored value. `modifiedAt`
 * becomes /M (or now) only when something changed.
 */
function reconcile(a: Annotation, std: Annotation, m: string | undefined): Annotation {
	const meta = stdMeta.get(std) ?? { hasCA: true, hasC: true, realQuads: true };
	const out: Record<string, unknown> = { ...a };
	let changed = false;
	const take = (key: string, value: unknown) => {
		out[key] = value;
		if (value === undefined) delete out[key];
		changed = true;
	};
	if (meta.hasC && !near(a.color, std.color, 0.01)) take('color', std.color);
	if (meta.hasCA && Math.abs(a.opacity - std.opacity) > 0.01) take('opacity', std.opacity);
	if (a.kind !== 'freetext' && !sameText(a.contents, std.contents)) take('contents', std.contents);
	if (isTextMarkup(a) && isTextMarkup(std)) {
		if (meta.realQuads && !near(a.quads.flat(), std.quads.flat(), 1)) {
			take('quads', std.quads);
			take('rect', std.rect);
		}
	} else if (a.kind === 'ink' && std.kind === 'ink') {
		const before = a.paths.flatMap((p) => p.points.flat());
		const after = std.paths.flatMap((p) => p.points.flat());
		if (!near(before, after, 1)) {
			take(
				'paths',
				std.paths.map((p, i) =>
					a.paths[i]?.pressure ? { ...p, pressure: a.paths[i].pressure } : p
				)
			);
			take('rect', std.rect);
		}
	} else if ('points' in a && a.points && 'points' in std && std.points?.length) {
		if (!near(a.points.flat(), std.points.flat(), 1)) {
			take('points', std.points);
			take('rect', std.rect);
		}
	} else if (a.kind === 'note') {
		// Viewers resize note icons around their centre (PDFKit: 20pt → 24pt); only a moved centre is an edit.
		const c = (r: number[]) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
		if (!near(c(a.rect), c(std.rect), 2)) {
			const [w, h] = [a.rect[2] - a.rect[0], a.rect[3] - a.rect[1]];
			const [cx, cy] = c(std.rect);
			take('rect', [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
		}
	} else if (!near(writtenRect(a), std.rect, 1.5)) {
		take('rect', std.rect);
	}
	if (std.author?.name && std.author.name !== a.author?.name)
		take('author', { ...a.author, name: std.author.name });
	if (changed) out.modifiedAt = m ?? new Date().toISOString();
	return out as unknown as Annotation;
}

/** Match an id-less annotation to the embedded model by page, kind and geometry (±1pt). */
function findByGeometry(
	stored: Map<string, Annotation>,
	used: Set<string>,
	std: Annotation
): Annotation | null {
	for (const cand of stored.values()) {
		if (used.has(cand.id) || cand.page !== std.page) continue;
		if (pdfSubtypeKey(cand.kind) !== pdfSubtypeKey(std.kind)) continue;
		if (sameGeometry(cand, std)) return cand;
	}
	return null;
}

/** Kinds that share a PDF subtype must compare equal here. */
function pdfSubtypeKey(kind: AnnotationKind): string {
	if (kind === 'area' || kind === 'rect') return 'Square';
	if (kind === 'line' || kind === 'arrow') return 'Line';
	return kind;
}

function close(a: number[], b: number[], tol = 1) {
	return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

function sameGeometry(cand: Annotation, std: Annotation): boolean {
	if (isTextMarkup(cand) && isTextMarkup(std)) {
		return close(quadsBounds(cand.quads) ?? [], quadsBounds(std.quads) ?? []);
	}
	if (cand.kind === 'ink' && std.kind === 'ink') {
		return close(
			cand.paths.flatMap((p) => p.points.flat()),
			std.paths.flatMap((p) => p.points.flat())
		);
	}
	if ('points' in cand && cand.points && 'points' in std && std.points) {
		return close(cand.points.flat(), std.points.flat());
	}
	return close(writtenRect(cand), std.rect, 1.5);
}

function compact<T extends object>(o: T): T {
	for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
	return o;
}

/** Map a standard PDF annotation dict to the closest model kind (and record which fields were present). */
function mapStandard(
	r: Readers,
	dict: PDFDict,
	subtype: string,
	page: number,
	ref: PDFRef | undefined
): Annotation | null {
	const a = mapStandardKind(r, dict, subtype, page, ref);
	if (a && !stdMeta.has(a))
		stdMeta.set(a, {
			hasCA: r.num(dict, 'CA') !== undefined,
			hasC: !!colorFromArray(r.nums(dict, 'C')),
			realQuads: true
		});
	return a;
}

function mapStandardKind(
	r: Readers,
	dict: PDFDict,
	subtype: string,
	page: number,
	ref: PDFRef | undefined
): Annotation | null {
	const rectArr = r.nums(dict, 'Rect');
	if (!rectArr || rectArr.length < 4) return null;
	const rect: PdfRect = [
		Math.min(rectArr[0], rectArr[2]),
		Math.min(rectArr[1], rectArr[3]),
		Math.max(rectArr[0], rectArr[2]),
		Math.max(rectArr[1], rectArr[3])
	];
	const flags = r.num(dict, 'F') ?? 0;
	const nm = r.text(dict, 'NM');
	const modified = fromPdfDate(r.text(dict, 'M'));
	const created =
		fromPdfDate(r.text(dict, 'CreationDate')) ?? modified ?? new Date(0).toISOString();
	const contents = r.text(dict, 'Contents')?.replace(/\r\n?/g, '\n').trim() || undefined;
	const author = r.text(dict, 'T');
	const label = r.text(dict, 'Subj');
	const ca = r.num(dict, 'CA');
	const color = colorFromArray(r.nums(dict, 'C'));
	const bs = r.dictOf(r.get(dict, 'BS'));
	const width = (bs && r.num(bs, 'W')) ?? r.nums(dict, 'Border')?.[2] ?? 1;
	const dash = bs && r.name(bs, 'S') === 'D' ? r.nums(bs, 'D') : undefined;
	const fill = colorFromArray(r.nums(dict, 'IC'));

	const base = (kind: AnnotationKind) => {
		const c = color ?? DEFAULT_COLOR[kind] ?? [0, 0, 0];
		return compact({
			id:
				nm ??
				(ref ? `pdf-${ref.objectNumber}-${ref.generationNumber}` : `pdf-${page}-${rect.join('-')}`),
			page,
			kind,
			rect,
			color: c,
			opacity: ca ?? 1,
			paletteKey: nearestPaletteKey(c),
			contents,
			label,
			author: author ? { name: author } : undefined,
			createdAt: created,
			modifiedAt: modified ?? created,
			locked: flags & (AnnotFlag.Locked | AnnotFlag.ReadOnly) ? true : undefined,
			hidden: flags & AnnotFlag.Hidden ? true : undefined,
			origin: 'foreign' as const
		});
	};

	switch (subtype) {
		case 'Highlight':
		case 'Underline':
		case 'StrikeOut':
		case 'Squiggly': {
			const kind = (
				{
					Highlight: 'highlight',
					Underline: 'underline',
					StrikeOut: 'strikeout',
					Squiggly: 'squiggly'
				} as const
			)[subtype];
			const qp = r.nums(dict, 'QuadPoints') ?? [];
			const quads: Quad[] = [];
			for (let i = 0; i + 8 <= qp.length; i += 8) quads.push(normalizeQuad(qp.slice(i, i + 8)));
			// No quads: fall back to the rect (some writers omit them, e.g. PDFKit for Squiggly).
			const realQuads = quads.length > 0;
			if (!realQuads)
				quads.push([rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]]);
			const a = { ...base(kind), kind, quads };
			stdMeta.set(a, { hasCA: ca !== undefined, hasC: !!color, realQuads });
			return a;
		}
		case 'Text':
			return compact({ ...base('note'), kind: 'note' as const, icon: r.name(dict, 'Name') });
		case 'Square':
		case 'Circle': {
			const kind = subtype === 'Square' ? ('rect' as const) : ('ellipse' as const);
			return compact({ ...base(kind), kind, width, fill, dash });
		}
		case 'Line': {
			const l = r.nums(dict, 'L') ?? [];
			const le = (r.array(dict, 'LE')?.asArray() ?? []).map(
				(x) =>
					ENDING_FROM_PDF[
						(r.resolve(x) as { decodeText?: () => string })?.decodeText?.() ?? 'None'
					] ?? 'none'
			);
			const endings: [LineEnding, LineEnding] = [le[0] ?? 'none', le[1] ?? 'none'];
			const arrow = endings.some((e) => e === 'open-arrow' || e === 'closed-arrow');
			const kind = arrow ? ('arrow' as const) : ('line' as const);
			const points: PdfPoint[] =
				l.length >= 4
					? [
							[l[0], l[1]],
							[l[2], l[3]]
						]
					: [];
			return compact({ ...base(kind), kind, width, dash, points, lineEndings: endings });
		}
		case 'Polygon':
		case 'PolyLine': {
			const v = r.nums(dict, 'Vertices') ?? [];
			const points: PdfPoint[] = [];
			for (let i = 0; i + 1 < v.length; i += 2) points.push([v[i], v[i + 1]]);
			const kind = subtype === 'Polygon' ? ('polygon' as const) : ('polyline' as const);
			return compact({
				...base(kind),
				kind,
				width,
				dash,
				fill: kind === 'polygon' ? fill : undefined,
				points
			});
		}
		case 'Ink': {
			const list = r.array(dict, 'InkList')?.asArray() ?? [];
			const paths = list.map((p) => {
				const v = r.numbers(p) ?? [];
				const points: PdfPoint[] = [];
				for (let i = 0; i + 1 < v.length; i += 2) points.push([v[i], v[i + 1]]);
				return { points };
			});
			return { ...base('ink'), kind: 'ink' as const, paths, width };
		}
		case 'FreeText': {
			const da = r.text(dict, 'DA') ?? '';
			const size = Number(/([\d.]+)\s+Tf/.exec(da)?.[1] ?? 12);
			const fontName = /\/(\S+)\s+[\d.]+\s+Tf/.exec(da)?.[1] ?? 'Helv';
			const family = fontFamilyOf(fontName);
			const rgb = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
			const textColor: Rgb | undefined = rgb
				? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
				: undefined;
			const q = r.num(dict, 'Q') ?? 0;
			const text = contents ?? stripTags(r.text(dict, 'RC') ?? '');
			const b = base('freetext');
			delete (b as { contents?: string }).contents;
			return compact({
				...b,
				kind: 'freetext' as const,
				text,
				font: { family, size } as const,
				align: alignFromQuadding(q),
				textColor,
				fill
			});
		}
		case 'Stamp':
			return compact({ ...base('stamp'), kind: 'stamp' as const, name: r.name(dict, 'Name') });
	}
	return null;
}

function stripTags(xhtml: string): string {
	return xhtml
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.trim();
}
