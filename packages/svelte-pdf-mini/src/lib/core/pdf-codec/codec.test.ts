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
import type { Annotation } from '../annotations/model.js';
import { exportPdf, importAnnotations, PdfSaveError, saveSupport } from './index.js';
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
