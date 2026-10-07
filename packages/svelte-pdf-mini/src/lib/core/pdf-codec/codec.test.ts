/**
 * Fast codec tests on small generated PDFs (the arXiv round trips are in
 * codec.slow.test.ts). The encrypted fixtures in src/lib/test/pdfs hold one
 * foreign highlight (/NM foreign-hl-1, /Contents "A note from Preview", /T
 * Alice); they were encrypted with pypdf: user password "" (owner password
 * only, RC4-128 and AES-256), and user password "user" (AES-256).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Annotation, FreeTextAnnotation, NoteAnnotation } from '../annotations/model.js';
import { FREETEXT_FONT_FAMILIES } from '../annotations/fonts.js';
import {
	annotationsToMarkdown,
	exportPdf,
	importAnnotations,
	PdfSaveError,
	saveSupport
} from './index.js';
import { lastStartXref, lastXrefIsStream, trimBeforeHeader } from './open.js';
import { foreignPdf } from './foreign.test.helper.js';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(fileURLToPath(new URL(`../../test/pdfs/${name}`, import.meta.url))));

const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const T0 = '2026-10-01T10:00:00.000Z';

const note: Annotation = {
	id: 'note-1',
	page: 1,
	kind: 'note',
	rect: [20, 20, 40, 40],
	color: [1, 0.85, 0.3],
	opacity: 1,
	contents: 'mine',
	createdAt: T0,
	modifiedAt: T0,
	origin: 'local'
};

/** Subtypes of page 1's annotations, as pdf.js sees them. */
async function pdfjsAnnotations(bytes: Uint8Array) {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = getDocument({ data: bytes.slice(), verbosity: 0 });
	const doc = await task.promise;
	const annots = await (await doc.getPage(1)).getAnnotations();
	await task.destroy();
	return annots.map((a) => `${a.subtype}:${a.contentsObj?.str ?? ''}`);
}

/** Prepend `junk` before %PDF-. `absolute`: also shift the xref offsets (they count from byte 0). */
function withJunk(pdf: Uint8Array, junk: string, absolute = false): Uint8Array {
	const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
	let body = pdf;
	if (absolute) {
		// The classic xref table and trailer are ASCII: rewrite them, keep the objects' bytes.
		const at = lastStartXref(pdf)!;
		const shift = junk.length;
		const table = latin1(pdf.subarray(at))
			.replace(
				/^(\d{10}) (\d{5}) n/gm,
				(_, off, gen) => `${String(+off + shift).padStart(10, '0')} ${gen} n`
			)
			.replace(/startxref\s+(\d+)/, (_, off) => `startxref\n${+off + shift}`);
		body = new Uint8Array([...pdf.subarray(0, at), ...ascii(table)]);
	}
	return new Uint8Array([...ascii(junk), ...body]);
}

describe('exportPdf / importAnnotations (fast)', () => {
	it('round-trips our annotations with an incremental update', async () => {
		const original = await foreignPdf();
		const out = await exportPdf(original, [note]);
		expect(out.subarray(0, original.length)).toEqual(original);
		const { annotations, foreign, saveSupport } = await importAnnotations(out);
		expect(saveSupport).toEqual({ encrypted: false, canSave: true });
		expect(foreign).toBe(1);
		expect(annotations.find((a) => a.id === 'note-1')).toEqual(note);
		expect(annotations.find((a) => a.id === 'preview-hl')).toMatchObject({
			kind: 'highlight',
			contents: 'from Preview',
			origin: 'foreign'
		});
	});

	it('round-trips note emoji, with the closest standard icon as /Name', async () => {
		const emojiNote = (emoji: string | undefined, i: number, icon = 'Comment'): NoteAnnotation => ({
			...(note as NoteAnnotation),
			id: `emoji-${i}`,
			rect: [20 + i * 30, 20, 40 + i * 30, 40],
			icon,
			...(emoji ? { emoji } : {})
		});
		const notes = [
			emojiNote('💬', 0),
			emojiNote('🤔', 1),
			emojiNote('💡', 2),
			emojiNote('📌', 3),
			emojiNote('🤯', 4),
			emojiNote('😵‍💫', 5),
			emojiNote(undefined, 6, 'Insert')
		];
		const out = await exportPdf(await foreignPdf(), notes);
		const { annotations } = await importAnnotations(out);
		for (const n of notes) expect(annotations.find((a) => a.id === n.id)).toEqual(n);

		// pdf.js reports "NoIcon" when there is an appearance stream: read /Name itself.
		const { PDFDocument, PDFDict, PDFName } = await import('@cantoo/pdf-lib');
		const doc = await PDFDocument.load(out);
		const names = doc
			.getPage(0)
			.node.Annots()!
			.asArray()
			.map((ref) => doc.context.lookup(ref, PDFDict))
			.filter((d) => d.get(PDFName.of('Subtype')) === PDFName.of('Text'))
			.map((d) => d.get(PDFName.of('Name'))?.toString());
		expect(names).toEqual([
			'/Comment',
			'/Help',
			'/Key',
			'/Note',
			'/Comment',
			'/Comment',
			'/Insert'
		]);
	});

	it('round-trips text box fonts, with the closest standard font in /DA and the appearance', async () => {
		const boxes = FREETEXT_FONT_FAMILIES.map((family, i): FreeTextAnnotation => ({
			id: `box-${family}`,
			page: 1,
			kind: 'freetext',
			color: [0.6, 0.7, 0.9],
			opacity: 1,
			createdAt: T0,
			modifiedAt: T0,
			origin: 'local',
			rect: [20, 100 + i * 40, 220, 130 + i * 40],
			text: `In ${family}`,
			font: { family, size: 11, ...(i === 0 ? { bold: true, italic: true } : {}) },
			textColor: [0.1, 0.2, 0.5]
		}));
		const out = await exportPdf(await foreignPdf(), boxes);
		const { annotations } = await importAnnotations(out);
		for (const b of boxes) expect(annotations.find((a) => a.id === b.id)).toEqual(b);

		const { PDFDocument, PDFDict, PDFHexString, PDFName, PDFStream, PDFString } =
			await import('@cantoo/pdf-lib');
		const doc = await PDFDocument.load(out);
		const dicts = doc
			.getPage(0)
			.node.Annots()!
			.asArray()
			.map((ref) => doc.context.lookup(ref, PDFDict))
			.filter((d) => d.get(PDFName.of('Subtype')) === PDFName.of('FreeText'));
		const text = (d: (typeof dicts)[number], key: string) =>
			d.lookup(PDFName.of(key), PDFString, PDFHexString).decodeText();
		expect(dicts.map((d) => text(d, 'DA'))).toEqual([
			'/Helv 11 Tf 0.1 0.2 0.5 rg',
			'/Helv 11 Tf 0.1 0.2 0.5 rg',
			'/TiRo 11 Tf 0.1 0.2 0.5 rg',
			'/Cour 11 Tf 0.1 0.2 0.5 rg'
		]);
		expect(text(dicts[0], 'DS')).toBe('font: italic bold 11pt Helvetica; color: rgb(26,51,128)');
		// The appearance draws with the matching standard font (Handwritten: Helvetica).
		const baseFonts = dicts.map((d) => {
			const ap = d.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
			const res = ap.dict.lookup(PDFName.of('Resources'), PDFDict);
			const f0 = res.lookup(PDFName.of('Font'), PDFDict).lookup(PDFName.of('F0'), PDFDict);
			return f0.get(PDFName.of('BaseFont'))?.toString();
		});
		expect(baseFonts).toEqual(['/Helvetica-BoldOblique', '/Helvetica', '/Times-Roman', '/Courier']);
	});

	it('keeps foreign annotations it is not told to remove (read-only policy)', async () => {
		const original = await foreignPdf();
		const imported = (await importAnnotations(original)).annotations;
		// Not in the list at all (e.g. hidden) and not removed: kept as is.
		const out = await exportPdf(original, [note]);
		expect(await pdfjsAnnotations(out)).toEqual(
			expect.arrayContaining(['Highlight:from Preview', 'Popup:from Preview', 'Text:mine'])
		);
		// In the list and unchanged: kept verbatim.
		const again = await importAnnotations(await exportPdf(original, [...imported, note]));
		expect(again.annotations.map((a) => a.id).sort()).toEqual(['note-1', 'preview-hl']);
	});

	it('deletes a foreign annotation the user removed (with its popup), and it stays gone', async () => {
		const original = await foreignPdf();
		const { annotations } = await importAnnotations(original);
		expect(annotations.map((a) => a.id)).toEqual(['preview-hl']);
		const out = await exportPdf(original, [note], { remove: ['preview-hl'] });
		const reimported = await importAnnotations(out);
		expect(reimported.annotations.map((a) => a.id)).toEqual(['note-1']);
		expect(reimported.foreign).toBe(0);
		expect(await pdfjsAnnotations(out)).toEqual(['Text:mine', 'Popup:mine']);
		// Saving again (from the saved file) keeps it deleted.
		const twice = await exportPdf(out, reimported.annotations);
		expect((await importAnnotations(twice)).annotations.map((a) => a.id)).toEqual(['note-1']);
	});

	it('`remove` never deletes an annotation that is still in the list', async () => {
		const original = await foreignPdf();
		const { annotations } = await importAnnotations(original);
		const out = await exportPdf(original, annotations, { remove: ['preview-hl'] });
		expect((await importAnnotations(out)).annotations.map((a) => a.id)).toEqual(['preview-hl']);
	});
});

describe('annotationsToMarkdown', () => {
	it('shows a note emoji in place of its color', () => {
		const md = annotationsToMarkdown([
			{ ...note, kind: 'note', emoji: '🤯', paletteKey: 'yellow' }
		]);
		expect(md).toContain('- p. 1 · 🤯 Note');
		expect(md).not.toContain('yellow');
		expect(annotationsToMarkdown([{ ...note, paletteKey: 'yellow' }])).toContain(
			'- p. 1 · Note · yellow'
		);
	});
});

describe('encrypted PDFs', () => {
	for (const name of ['owner-password-rc4.pdf', 'owner-password-aes256.pdf']) {
		it(`${name}: opens without a password, reads decrypted text and saves`, async () => {
			const bytes = fixture(name);
			expect(await saveSupport(bytes)).toEqual({ encrypted: true, canSave: true });
			const imported = await importAnnotations(bytes);
			expect(imported.saveSupport).toEqual({ encrypted: true, canSave: true });
			expect(imported.annotations).toMatchObject([
				{ id: 'foreign-hl-1', contents: 'A note from Preview', author: { name: 'Alice' } }
			]);

			const out = await exportPdf(bytes, [...imported.annotations, note]);
			// A full, decrypted rewrite: no /Encrypt and no stale cross-reference stream left.
			expect(latin1(out).startsWith('%PDF-')).toBe(true);
			expect(latin1(out)).not.toMatch(/\/Encrypt|\/XRef/);
			expect(await saveSupport(out)).toEqual({ encrypted: false, canSave: true });
			const again = await importAnnotations(out);
			expect(again.annotations.map((a) => [a.id, a.contents])).toEqual([
				['foreign-hl-1', 'A note from Preview'],
				['note-1', 'mine']
			]);
			expect(await pdfjsAnnotations(out)).toEqual(
				expect.arrayContaining(['Highlight:A note from Preview', 'Text:mine'])
			);

			// The foreign highlight can be deleted from an encrypted file too.
			const removed = await exportPdf(bytes, [note], { remove: ['foreign-hl-1'] });
			expect((await importAnnotations(removed)).annotations.map((a) => a.id)).toEqual(['note-1']);
		});
	}

	it('a PDF that needs a password to open is reported and never saved', async () => {
		const bytes = fixture('user-password-aes256.pdf');
		const blocked = { encrypted: true, canSave: false, saveBlockedReason: 'password' };
		expect(await saveSupport(bytes)).toEqual(blocked);
		const err = await exportPdf(bytes, [note]).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(PdfSaveError);
		expect((err as PdfSaveError).reason).toBe('password');

		const withoutPassword = await importAnnotations(bytes);
		expect(withoutPassword.saveSupport).toEqual(blocked);
		expect(withoutPassword.warnings).toHaveLength(1);
		const withPassword = await importAnnotations(bytes, { password: 'user' });
		expect(withPassword.saveSupport).toEqual(blocked);
		expect(withPassword.warnings).toEqual([]);
		expect(withPassword.annotations[0]).toMatchObject({
			id: 'foreign-hl-1',
			contents: 'A note from Preview'
		});
	});
});

describe('bytes before %PDF-', () => {
	const junk = 'HTTP/1.1 200 OK\r\n\r\n';

	it('reads, and saves incrementally a header-aligned file (offsets counted from %PDF-)', async () => {
		const clean = await foreignPdf();
		const bytes = withJunk(clean, junk);
		expect(trimBeforeHeader(bytes).offsetsValid).toBe(true);
		expect(await saveSupport(bytes)).toEqual({ encrypted: false, canSave: true });
		expect((await importAnnotations(bytes)).annotations.map((a) => a.id)).toEqual(['preview-hl']);

		const out = await exportPdf(bytes, [note]);
		// The junk is dropped, the original is kept as a prefix, and the update matches its classic xref table.
		expect(out.subarray(0, clean.length)).toEqual(clean);
		expect(lastXrefIsStream(out)).toBe(false);
		expect(latin1(out.subarray(clean.length))).toMatch(/\nxref\n[\s\S]*trailer/);
		expect((await importAnnotations(out)).annotations.map((a) => a.id).sort()).toEqual([
			'note-1',
			'preview-hl'
		]);
		expect(await pdfjsAnnotations(out)).toContain('Text:mine');
	});

	it('rewrites a file whose offsets count the junk', async () => {
		const bytes = withJunk(await foreignPdf(), junk, true);
		expect(trimBeforeHeader(bytes).offsetsValid).toBe(false);
		expect(await pdfjsAnnotations(bytes)).toContain('Highlight:from Preview');
		const out = await exportPdf(bytes, [note]);
		expect(latin1(out).startsWith('%PDF-')).toBe(true);
		expect((await importAnnotations(out)).annotations.map((a) => a.id).sort()).toEqual([
			'note-1',
			'preview-hl'
		]);
		expect(await pdfjsAnnotations(out)).toEqual(
			expect.arrayContaining(['Highlight:from Preview', 'Text:mine'])
		);
	});
});
