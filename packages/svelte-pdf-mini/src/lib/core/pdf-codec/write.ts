/**
 * Export: write the annotation model into a PDF as standard annotations.
 *
 * - Standard subtypes with generated appearance streams, so every viewer
 *   (Apple Preview, Acrobat, Chrome, Firefox) renders them as we do.
 * - Lossless round-trip: a private /SPM_Data key per annotation plus an
 *   embedded `svelte-pdf-mini.json` holding the full model.
 * - Re-export replaces what we wrote before; foreign annotations stay as they
 *   are unless they are in the list (and changed).
 * - Incremental by default: the original bytes are kept as a prefix. Files
 *   encrypted with an owner password only are decrypted and rewritten.
 */
import type {
	PDFContext,
	PDFDict,
	PDFDocument,
	PDFFont,
	PDFInvalidObject,
	PDFPage,
	PDFRef
} from '@cantoo/pdf-lib';
import type { PdfRect } from '../types.js';
import type {
	Annotation,
	FreeTextAnnotation,
	LineEnding,
	StampAnnotation
} from '../annotations/model.js';
import { ANNOTATION_SCHEMA_VERSION, isTextMarkup } from '../annotations/model.js';
import { quadsBounds } from '../text/text-index.js';
import { appearanceOps, lineEndingsOf, type GraphicsState } from './appearance.js';
import { lastXrefIsStream, openForWrite } from './open.js';
import { makeReaders, readEmbeddedModel, type Readers } from './pdf-objects.js';
import {
	AnnotFlag,
	DA_FONT_NAMES,
	EMBEDDED_FILE_NAME,
	GENERATOR,
	PRIVATE_KEY,
	QUADDING,
	boundsOf,
	importedModifiedAt,
	loadPdfLib,
	n,
	privateDataOf,
	toPdfDate,
	type PdfLib
} from './shared.js';

export interface ExportOptions {
	/** 'incremental' (default) appends an update and keeps the original bytes; 'full' rewrites the file. */
	mode?: 'incremental' | 'full';
	/** Draw the annotations into the page content instead of writing annotation objects. */
	flatten?: boolean;
	/** Sets the document /Producer (and /ModDate). */
	producer?: string;
	/**
	 * Which existing annotations to remove when they are not in the list:
	 * 'ours' (default) removes only annotations svelte-pdf-mini wrote; 'all'
	 * also removes foreign markup/shape annotations (links and form fields are always kept).
	 */
	prune?: 'ours' | 'all';
	/**
	 * Ids of annotations in the PDF to delete although they are not ours: the
	 * foreign annotations the user deleted (see `AnnotationStore.removedForeign`).
	 */
	remove?: readonly string[];
}

const SUBTYPE: Record<Annotation['kind'], string> = {
	highlight: 'Highlight',
	underline: 'Underline',
	strikeout: 'StrikeOut',
	squiggly: 'Squiggly',
	note: 'Text',
	area: 'Square',
	rect: 'Square',
	ellipse: 'Circle',
	line: 'Line',
	arrow: 'Line',
	polygon: 'Polygon',
	polyline: 'PolyLine',
	ink: 'Ink',
	freetext: 'FreeText',
	stamp: 'Stamp'
};

const LINE_ENDING: Record<LineEnding, string> = {
	none: 'None',
	'open-arrow': 'OpenArrow',
	'closed-arrow': 'ClosedArrow',
	circle: 'Circle',
	square: 'Square',
	diamond: 'Diamond',
	butt: 'Butt'
};

/** Subtypes we may prune with `prune: 'all'` (never links, widgets, attachments…). */
const PRUNABLE = new Set([
	'Text',
	'FreeText',
	'Line',
	'Square',
	'Circle',
	'Polygon',
	'PolyLine',
	'Highlight',
	'Underline',
	'Squiggly',
	'StrikeOut',
	'Stamp',
	'Caret',
	'Ink'
]);

/**
 * Write `annotations` into the PDF and return the new file bytes. Throws
 * `PdfSaveError` for files that need a password to open (see `saveSupport`).
 */
export async function exportPdf(
	input: Uint8Array | ArrayBuffer,
	annotations: Annotation[],
	opts: ExportOptions = {}
): Promise<Uint8Array> {
	const lib = await loadPdfLib();
	const { PDFName, PDFRef } = lib;
	// Decrypted files and files whose offsets don't match their header are rewritten.
	const { doc, bytes, incremental } = await openForWrite(
		input,
		(opts.mode ?? 'incremental') === 'incremental'
	);
	const ctx = doc.context;
	const r = makeReaders(lib, ctx);
	const pages = doc.getPages();
	const stored = readEmbeddedModel(doc);
	const listed = new Map(annotations.map((a) => [a.id, a]));
	const deleted = new Set(opts.remove);

	// 1. Scan existing annotations: remove ours, keep or replace foreign ones.
	const existingRefById = new Map<string, PDFRef>();
	const keep = new Set<string>();
	for (const page of pages) {
		const annots = page.node.Annots();
		if (!annots) continue;
		const remove: PDFRef[] = [];
		const popups: [PDFRef, PDFRef | undefined][] = [];
		for (const entry of annots.asArray()) {
			if (!(entry instanceof PDFRef)) continue;
			const dict = r.dictOf(entry);
			if (!dict) continue;
			const subtype = r.name(dict, 'Subtype');
			if (subtype === 'Popup') {
				popups.push([entry, r.refOf(dict, 'Parent')]);
				continue;
			}
			const nm = r.text(dict, 'NM');
			const id = nm ?? `pdf-${entry.objectNumber}-${entry.generationNumber}`;
			if (isOurs(r, dict, stored)) {
				remove.push(entry);
				continue;
			}
			const wanted = listed.get(id);
			if (deleted.has(id) && !wanted) remove.push(entry);
			else if (wanted) {
				// A foreign annotation edited in our UI is rewritten; unchanged ones are kept verbatim.
				if (unchangedForeign(r, dict, wanted)) {
					keep.add(id);
					existingRefById.set(id, entry);
				} else remove.push(entry);
			} else if (opts.prune === 'all' && subtype && PRUNABLE.has(subtype)) {
				remove.push(entry);
			} else existingRefById.set(id, entry);
		}
		// Popups follow their parent: drop them if the parent goes.
		const gone = new Set(remove.map(refKey));
		for (const [popup, parent] of popups)
			if (parent && gone.has(refKey(parent))) remove.push(popup);
		for (const ref of remove) removeAnnotation(lib, ctx, r, page, ref);
	}

	// 2. Write (or flatten) the listed annotations.
	const toWrite = annotations.filter((a) => !keep.has(a.id) && !(opts.flatten && a.hidden));
	const fonts = new FontCache(doc, lib);
	if (opts.flatten) {
		doc.detach(EMBEDDED_FILE_NAME);
		const touched = new Set<PDFPage>();
		for (const a of toWrite) {
			const page = pages[a.page - 1];
			if (!page) continue;
			if (!touched.has(page)) {
				touched.add(page);
				// Isolate the existing content's graphics state before drawing on top.
				page.node.normalize();
				page.node.wrapContentStreams(
					ctx.getPushGraphicsStateContentStream(),
					ctx.getPopGraphicsStateContentStream()
				);
			}
			const ap = await buildAppearance(lib, ctx, a, fonts, doc);
			const name = page.node.newXObject('SPMAnnot', ap);
			page.node.addContentStream(ctx.register(ctx.flateStream(`q ${name.asString()} Do Q`)));
		}
	} else {
		const refs = new Map<string, PDFRef>(existingRefById);
		for (const a of toWrite) refs.set(a.id, ctx.nextRef());
		for (const a of toWrite) {
			const page = pages[a.page - 1];
			if (!page) continue;
			const ref = refs.get(a.id)!;
			const dict = await buildAnnotDict(lib, ctx, a, fonts, doc, refs);
			ctx.assign(ref, dict);
			page.node.addAnnot(ref);
			if (a.contents) {
				const popup = ctx.register(
					ctx.obj({
						Type: 'Annot',
						Subtype: 'Popup',
						Rect: popupRect(a.rect, page),
						Parent: ref,
						Open: false,
						F: AnnotFlag.Print | AnnotFlag.NoZoom | AnnotFlag.NoRotate
					})
				);
				dict.set(PDFName.of('Popup'), popup);
				page.node.addAnnot(popup);
			}
		}

		// 3. The full model, as an embedded file (survives re-serializers that drop unknown keys).
		const ours = annotations.filter((a) => !keep.has(a.id));
		doc.detach(EMBEDDED_FILE_NAME);
		if (ours.length) {
			const json = JSON.stringify({
				schema: ANNOTATION_SCHEMA_VERSION,
				generator: GENERATOR,
				annotations: ours
			});
			await doc.attach(new TextEncoder().encode(json), EMBEDDED_FILE_NAME, {
				mimeType: 'application/json',
				description: 'svelte-pdf-mini annotations (lossless model)',
				afRelationship: lib.AFRelationship.Data,
				modificationDate: new Date()
			});
		}
	}

	if (opts.producer) {
		doc.setProducer(opts.producer);
		doc.setModificationDate(new Date());
	}
	// Match the original's cross-reference format: appending an xref stream to a
	// file that uses a classic xref table trips Apple's PDF parser (Preview).
	if (incremental) return doc.commit({ useObjectStreams: lastXrefIsStream(bytes) });
	dropStaleObjects(lib, ctx);
	return doc.save({ useObjectStreams: false, rewrite: true });
}

/**
 * Before a full rewrite: the source's cross-reference streams and (once
 * decrypted) its encryption dictionary would be copied as ordinary objects,
 * and parsers that scan for them would pick up the stale trailer keys.
 */
function dropStaleObjects(lib: PdfLib, ctx: PDFContext) {
	const { PDFDict, PDFInvalidObject, PDFName, PDFStream } = lib;
	const key = (k: string) => PDFName.of(k);
	for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
		// Decrypting an encrypted file leaves its (unencrypted) xref stream unparsed.
		if (obj instanceof PDFInvalidObject) {
			if (isRawXrefStream(obj)) ctx.delete(ref);
			continue;
		}
		const dict = obj instanceof PDFStream ? obj.dict : undefined;
		const target = obj instanceof PDFDict ? obj : dict;
		if (!target) continue;
		const isXref = target.get(key('Type')) === key('XRef');
		const isEncrypt =
			ctx.isDecrypted &&
			target.get(key('Filter')) === key('Standard') &&
			target.has(key('O')) &&
			target.has(key('U'));
		if (isXref || isEncrypt) ctx.delete(ref);
	}
}

/** An unparsed object whose dictionary (before `stream`) says /Type /XRef. */
function isRawXrefStream(obj: PDFInvalidObject): boolean {
	const raw = new Uint8Array(obj.sizeInBytes());
	obj.copyBytesInto(raw, 0);
	const head = new TextDecoder('latin1').decode(raw.subarray(0, 1024)).split('stream')[0];
	return /^\s*<</.test(head) && /\/Type\s*\/XRef\b/.test(head);
}

const refKey = (ref: PDFRef) => `${ref.objectNumber}-${ref.generationNumber}`;

/** Written by us: has our private key, or its /NM is in the embedded model. */
function isOurs(r: Readers, dict: PDFDict | undefined, stored: Map<string, Annotation>) {
	if (!dict) return false;
	if (r.get(dict, PRIVATE_KEY) !== undefined) return true;
	const nm = r.text(dict, 'NM');
	return !!nm && stored.has(nm);
}

/** A foreign annotation in the list that the user has not modified since import. */
function unchangedForeign(r: Readers, dict: PDFDict, a: Annotation) {
	if (a.origin !== 'foreign') return false;
	const m = importedModifiedAt(r.text(dict, 'M'), r.text(dict, 'CreationDate'));
	return Math.abs(Date.parse(m) - Date.parse(a.modifiedAt)) < 1000;
}

function removeAnnotation(lib: PdfLib, ctx: PDFContext, r: Readers, page: PDFPage, ref: PDFRef) {
	const dict = r.dictOf(ref);
	page.node.removeAnnot(ref);
	if (dict) {
		const ap = r.dictOf(dict.get(lib.PDFName.of('AP')));
		const normal = ap?.get(lib.PDFName.of('N'));
		if (normal instanceof lib.PDFRef) ctx.delete(normal);
	}
	ctx.delete(ref);
}

/** Popup window rect: in the right margin next to the annotation (viewers may move it). */
function popupRect(rect: PdfRect, page: PDFPage): PdfRect {
	const { width } = page.getSize();
	const x1 = Math.min(width - 10, Math.max(rect[2] + 10, width - 190));
	return [x1, rect[3] - 120, Math.min(width, x1 + 180), rect[3]];
}

/** Rect that encloses all geometry (pdf.js drops /QuadPoints outside /Rect). */
export function writtenRect(a: Annotation): PdfRect {
	let [x1, y1, x2, y2] = a.rect;
	const grow = (b: PdfRect | null, pad: number) => {
		if (!b) return;
		x1 = Math.min(x1, b[0] - pad);
		y1 = Math.min(y1, b[1] - pad);
		x2 = Math.max(x2, b[2] + pad);
		y2 = Math.max(y2, b[3] + pad);
	};
	if (isTextMarkup(a)) grow(quadsBounds(a.quads), 1);
	if (a.kind === 'ink')
		grow(a.paths.length ? boundsOf(a.paths.flatMap((p) => p.points)) : null, a.width);
	if (
		(a.kind === 'line' || a.kind === 'arrow' || a.kind === 'polygon' || a.kind === 'polyline') &&
		a.points?.length
	)
		grow(boundsOf(a.points), Math.max(6, (a.width ?? 1) * 4));
	return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

/** Lazily embedded standard fonts for free text and stamps. */
class FontCache {
	#fonts = new Map<string, Promise<PDFFont>>();
	constructor(
		private doc: PDFDocument,
		private lib: PdfLib
	) {}
	get(family: 'Helvetica' | 'Times' | 'Courier', bold = false, italic = false): Promise<PDFFont> {
		const S = this.lib.StandardFonts;
		const table = {
			Helvetica: [S.Helvetica, S.HelveticaBold, S.HelveticaOblique, S.HelveticaBoldOblique],
			Times: [S.TimesRoman, S.TimesRomanBold, S.TimesRomanItalic, S.TimesRomanBoldItalic],
			Courier: [S.Courier, S.CourierBold, S.CourierOblique, S.CourierBoldOblique]
		} as const;
		const font = table[family][(bold ? 1 : 0) + (italic ? 2 : 0)];
		let p = this.#fonts.get(font);
		if (!p) {
			p = this.doc.embedFont(font);
			this.#fonts.set(font, p);
		}
		return p;
	}
}

/** Encode text for a standard (WinAnsi) font, replacing unsupported characters. */
function safeEncode(font: PDFFont, text: string): { hex: string; text: string } {
	let ok = '';
	for (const ch of text) {
		try {
			font.encodeText(ch);
			ok += ch;
		} catch {
			ok += '?';
		}
	}
	return { hex: font.encodeText(ok).toString(), text: ok };
}

/** Greedy word wrap to `width` points. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
	const out: string[] = [];
	for (const para of text.split(/\r?\n/)) {
		let line = '';
		for (const word of para.split(/(\s+)/)) {
			const next = line + word;
			const w = font.widthOfTextAtSize(safeEncode(font, next).text, size);
			if (w > width && line.trim()) {
				out.push(line.trimEnd());
				line = word.trimStart();
			} else line = next;
		}
		out.push(line.trimEnd());
	}
	return out;
}

/** Build the /AP /N form XObject for an annotation; returns its ref. */
async function buildAppearance(
	lib: PdfLib,
	ctx: PDFContext,
	a: Annotation,
	fonts: FontCache,
	doc: PDFDocument
): Promise<PDFRef> {
	const rect = writtenRect(a);
	const { ops, gs } = appearanceOps(a);
	const extra: string[] = [];
	const resources: Record<string, unknown> = {};
	if (a.kind === 'freetext') extra.push(await freeTextOps(a, fonts, resources));
	if (a.kind === 'stamp') extra.push(await stampOps(a, fonts, doc, resources));
	const ext: Record<string, unknown> = {};
	for (const [k, g] of Object.entries(gs) as [string, GraphicsState][]) {
		ext[k] = {
			Type: 'ExtGState',
			...(g.CA !== undefined && { CA: g.CA }),
			...(g.ca !== undefined && { ca: g.ca }),
			...(g.BM && { BM: g.BM })
		};
	}
	const stream = ctx.flateStream([ops, ...extra].join('\n'), {
		Type: 'XObject',
		Subtype: 'Form',
		FormType: 1,
		BBox: rect,
		Matrix: [1, 0, 0, 1, 0, 0],
		Resources: { ExtGState: ext, ...resources } as never
	});
	return ctx.register(stream);
}

/** Left edge of a FreeText line of width `w` inside [x1, x2] with `pad` insets. */
function lineStartX(
	align: FreeTextAnnotation['align'],
	x1: number,
	x2: number,
	w: number,
	pad: number
): number {
	switch (align) {
		case 'center':
			return (x1 + x2 - w) / 2;
		case 'right':
			return x2 - pad - w;
		default:
			return x1 + pad;
	}
}

async function freeTextOps(
	a: FreeTextAnnotation,
	fonts: FontCache,
	resources: Record<string, unknown>
) {
	const font = await fonts.get(a.font.family, a.font.bold, a.font.italic);
	resources.Font = { F0: font.ref };
	const pad = 4;
	const size = a.font.size;
	const [x1, , x2, y2] = a.rect;
	const lines = wrap(font, a.text, size, x2 - x1 - 2 * pad);
	const [r, g, b] = a.textColor ?? [0, 0, 0];
	const out: string[] = ['BT', `/F0 ${n(size)} Tf`, `${n(r)} ${n(g)} ${n(b)} rg`];
	let y = y2 - pad - size * 0.8;
	for (const line of lines) {
		const { hex, text } = safeEncode(font, line);
		const w = font.widthOfTextAtSize(text, size);
		const x = lineStartX(a.align, x1, x2, w, pad);
		out.push(`1 0 0 1 ${n(x)} ${n(y)} Tm ${hex} Tj`);
		y -= size * 1.2;
	}
	out.push('ET');
	return out.join('\n');
}

async function stampOps(
	a: StampAnnotation,
	fonts: FontCache,
	doc: PDFDocument,
	resources: Record<string, unknown>
) {
	const [x1, y1, x2, y2] = a.rect;
	if (a.image) {
		const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(a.image);
		if (m) {
			const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
			const img =
				m[1].toLowerCase() === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
			resources.XObject = { Im0: img.ref };
			return `q ${n(x2 - x1)} 0 0 ${n(y2 - y1)} ${n(x1)} ${n(y1)} cm /Im0 Do Q`;
		}
	}
	const font = await fonts.get('Helvetica', true);
	resources.Font = { F0: font.ref };
	const label = (a.name ?? 'Stamp').toUpperCase();
	const size = Math.max(
		6,
		Math.min((y2 - y1) * 0.5, ((x2 - x1) * 0.9) / Math.max(1, label.length * 0.62))
	);
	const { hex, text } = safeEncode(font, label);
	const w = font.widthOfTextAtSize(text, size);
	const [r, g, b] = a.color;
	return `BT /F0 ${n(size)} Tf ${n(r)} ${n(g)} ${n(b)} rg 1 0 0 1 ${n((x1 + x2 - w) / 2)} ${n((y1 + y2) / 2 - size * 0.35)} Tm ${hex} Tj ET`;
}

/** Simple XHTML rich text (/RC) from plain or Markdown contents. */
export function richText(contents: string): string {
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const paras = contents.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`);
	return (
		'<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" ' +
		`xfa:APIVersion="Acrobat:7.0.0" xfa:spec="2.0.2">${paras.join('')}</body>`
	);
}

async function buildAnnotDict(
	lib: PdfLib,
	ctx: PDFContext,
	a: Annotation,
	fonts: FontCache,
	doc: PDFDocument,
	refs: Map<string, PDFRef>
): Promise<PDFDict> {
	const { PDFHexString, PDFName } = lib;
	const rect = writtenRect(a);
	let flags = AnnotFlag.Print;
	if (a.hidden) flags |= AnnotFlag.Hidden;
	if (a.locked) flags |= AnnotFlag.Locked;
	if (a.kind === 'note') flags |= AnnotFlag.NoZoom | AnnotFlag.NoRotate;

	const entries: Record<string, unknown> = {
		Type: 'Annot',
		Subtype: SUBTYPE[a.kind],
		Rect: rect,
		F: flags,
		C: a.color,
		CA: a.opacity,
		M: PDFHexString.fromText(toPdfDate(a.modifiedAt)),
		CreationDate: PDFHexString.fromText(toPdfDate(a.createdAt)),
		NM: PDFHexString.fromText(a.id),
		AP: { N: await buildAppearance(lib, ctx, a, fonts, doc) }
	};
	if (a.author?.name) entries.T = PDFHexString.fromText(a.author.name);
	if (a.contents) {
		entries.Contents = PDFHexString.fromText(a.contents);
		entries.RC = PDFHexString.fromText(richText(a.contents));
	}
	if (a.label) entries.Subj = PDFHexString.fromText(a.label);
	if (a.inReplyTo && refs.has(a.inReplyTo)) {
		entries.IRT = refs.get(a.inReplyTo);
		entries.RT = 'R';
	}

	switch (a.kind) {
		case 'highlight':
		case 'underline':
		case 'strikeout':
		case 'squiggly':
			entries.QuadPoints = a.quads.flat();
			break;
		case 'note':
			entries.Name = a.icon ?? 'Comment';
			entries.Open = false;
			break;
		case 'area':
			entries.IC = a.fill ?? a.color;
			entries.BS = { W: a.width ?? 1.5, S: 'S' };
			break;
		case 'rect':
		case 'ellipse':
		case 'polygon':
		case 'polyline':
		case 'line':
		case 'arrow':
			entries.BS = a.dash?.length ? { W: a.width, S: 'D', D: a.dash } : { W: a.width, S: 'S' };
			if (a.fill && a.kind !== 'line' && a.kind !== 'arrow' && a.kind !== 'polyline')
				entries.IC = a.fill;
			if (a.kind === 'line' || a.kind === 'arrow') {
				const [p1, p2] = a.points ?? [];
				if (p1 && p2) entries.L = [p1[0], p1[1], p2[0], p2[1]];
				entries.LE = lineEndingsOf(a).map((e) => LINE_ENDING[e]);
			}
			if (a.kind === 'polygon' || a.kind === 'polyline') entries.Vertices = (a.points ?? []).flat();
			if (a.kind === 'polyline') entries.LE = lineEndingsOf(a).map((e) => LINE_ENDING[e]);
			break;
		case 'ink':
			entries.InkList = a.paths.map((p) => p.points.flat());
			entries.BS = { W: a.width, S: 'S' };
			break;
		case 'freetext': {
			const [r, g, b] = a.textColor ?? [0, 0, 0];
			const fam = DA_FONT_NAMES[a.font.family];
			entries.DA = PDFHexString.fromText(`/${fam} ${n(a.font.size)} Tf ${n(r)} ${n(g)} ${n(b)} rg`);
			const fontStyle = `${a.font.italic ? 'italic ' : ''}${a.font.bold ? 'bold ' : ''}`;
			const rgb255 = [r, g, b].map((c) => Math.round(c * 255)).join(',');
			const css = `font: ${fontStyle}${n(a.font.size)}pt ${a.font.family}; color: rgb(${rgb255})`;
			entries.DS = PDFHexString.fromText(css);
			entries.Q = QUADDING[a.align ?? 'left'];
			entries.Contents = PDFHexString.fromText(a.text + (a.contents ? `\n\n${a.contents}` : ''));
			if (a.fill) entries.IC = a.fill;
			break;
		}
		case 'stamp':
			entries.Name = a.name ?? 'Draft';
			break;
	}
	const dict = ctx.obj(entries as never) as unknown as PDFDict;
	dict.set(
		PDFName.of(PRIVATE_KEY),
		PDFHexString.fromText(JSON.stringify(privateDataOf(a, ANNOTATION_SCHEMA_VERSION)))
	);
	return dict;
}
