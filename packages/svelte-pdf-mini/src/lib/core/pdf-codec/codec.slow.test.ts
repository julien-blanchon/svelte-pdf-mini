import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Annotation } from '../annotations/model.js';
import {
	annotationsFromJSON,
	annotationsToJSON,
	annotationsToMarkdown,
	exportPdf,
	importAnnotations
} from './index.js';
import { EMBEDDED_FILE_NAME, loadPdfLib, PRIVATE_KEY } from './shared.js';
import { loadAttention, RED_PNG, sampleAnnotations } from './samples.test.helper.js';

const OUT_DIR = fileURLToPath(new URL('../../../../../../fixtures/out/', import.meta.url));

const byId = (list: Annotation[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

async function pdfjsAnnotations(bytes: Uint8Array) {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = getDocument({ data: bytes.slice(), verbosity: 0 });
	const doc = await task.promise;
	const out: Record<
		number,
		Awaited<ReturnType<Awaited<ReturnType<typeof doc.getPage>>['getAnnotations']>>
	> = {};
	for (let p = 1; p <= Math.min(doc.numPages, 3); p++)
		out[p] = await (await doc.getPage(p)).getAnnotations();
	await task.destroy();
	return out;
}

/** Mutate exported annotation dicts with pdf-lib (simulating another app), full rewrite. */
async function mutate(
	bytes: Uint8Array,
	fn: (
		dict: import('@cantoo/pdf-lib').PDFDict,
		lib: Awaited<ReturnType<typeof loadPdfLib>>
	) => void,
	dropEmbedded = false
) {
	const lib = await loadPdfLib();
	const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false });
	for (const page of doc.getPages()) {
		for (const ref of page.node.Annots()?.asArray() ?? []) {
			const dict = doc.context.lookup(ref);
			if (dict instanceof lib.PDFDict) fn(dict, lib);
		}
	}
	if (dropEmbedded) doc.detach(EMBEDDED_FILE_NAME);
	return doc.save({ useObjectStreams: false });
}

describe('pdf annotation codec', () => {
	let original: Uint8Array;
	let samples: Annotation[];
	let exported: Uint8Array;

	beforeAll(async () => {
		const { bytes, text1, text2 } = await loadAttention();
		original = bytes;
		samples = sampleAnnotations(text1, text2);
		exported = await exportPdf(original, samples);
		mkdirSync(OUT_DIR, { recursive: true });
		writeFileSync(`${OUT_DIR}attention-annotated.pdf`, exported);
		// Every kind on page 1, for a one-glance manual check in Preview / Acrobat.
		writeFileSync(
			`${OUT_DIR}attention-all-on-page1.pdf`,
			await exportPdf(
				original,
				samples.map((a) => ({ ...a, page: 1 }))
			)
		);
	});

	it('(1) round-trips every kind losslessly', async () => {
		const { annotations, foreign, unsupported, warnings } = await importAnnotations(exported);
		expect(warnings).toEqual([]);
		expect(foreign).toBe(0);
		expect(unsupported).toBeGreaterThan(0); // the paper's own hyperref links
		expect(byId(annotations)).toEqual(byId(samples));
	});

	it('(1b) round-trips from /SPM_Data alone when the embedded file is gone', async () => {
		const stripped = await mutate(exported, () => {}, true);
		const { annotations, foreign } = await importAnnotations(stripped);
		expect(foreign).toBe(0);
		expect(byId(annotations)).toEqual(byId(samples));
	});

	it('(2) writes standard annotations other readers understand', async () => {
		const pages = await pdfjsAnnotations(exported);
		const ours = Object.values(pages)
			.flat()
			.filter((a) => a.subtype !== 'Link' && a.subtype !== 'Popup');
		expect(ours.map((a) => a.subtype).sort()).toEqual(
			[
				'Circle',
				'FreeText',
				'Highlight',
				'Ink',
				'Line',
				'Line',
				'PolyLine',
				'Polygon',
				'Square',
				'Square',
				'Squiggly',
				'Stamp',
				'StrikeOut',
				'Text',
				'Text',
				'Underline'
			].sort()
		);
		for (const a of ours) expect(a.hasAppearance, `${a.subtype} has an appearance`).toBe(true);
		const hl = ours.find((a) => a.subtype === 'Highlight')!;
		expect(hl.quadPoints?.length).toBeGreaterThan(0);
		expect(hl.contentsObj?.str).toBe('The title — with **Markdown** and ünïcödé.');
		expect(hl.titleObj?.str).toBe('Julien');
		const reply = ours.find((a) => a.contentsObj?.str === 'I agree!')!;
		expect(reply.inReplyTo).toBe(hl.id);
		// Popups exist for commented annotations.
		expect(
			Object.values(pages)
				.flat()
				.some((a) => a.subtype === 'Popup')
		).toBe(true);
	});

	it('(3) incremental export keeps the original bytes as a prefix', () => {
		expect(exported.length).toBeGreaterThan(original.length);
		expect(Buffer.from(exported.subarray(0, original.length)).equals(Buffer.from(original))).toBe(
			true
		);
	});

	it('(3b) full export rewrites the file and still round-trips', async () => {
		const full = await exportPdf(original, samples, { mode: 'full' });
		writeFileSync(`${OUT_DIR}attention-annotated-full.pdf`, full);
		const { annotations } = await importAnnotations(full);
		expect(byId(annotations)).toEqual(byId(samples));
	});

	it('(4) re-export removes deleted annotations and keeps foreign ones', async () => {
		// A foreign highlight (no /NM, no private data) made by "another app".
		const lib = await loadPdfLib();
		const doc = await lib.PDFDocument.load(original, { updateMetadata: false });
		const page = doc.getPage(0);
		const foreignRef = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Highlight',
				Rect: [100, 100, 200, 120],
				QuadPoints: [100, 120, 200, 120, 100, 100, 200, 100],
				C: [0, 1, 0],
				Contents: lib.PDFHexString.fromText('foreign')
			})
		);
		page.node.addAnnot(foreignRef);
		const withForeign = await doc.save({ useObjectStreams: false });

		const first = await exportPdf(withForeign, samples);
		const before = await importAnnotations(first);
		expect(before.foreign).toBe(1);
		const remaining = samples.filter((a) => a.id !== 'rect-1');
		const second = await exportPdf(first, remaining);
		const after = await importAnnotations(second);
		expect(after.annotations.find((a) => a.id === 'rect-1')).toBeUndefined();
		expect(after.foreign).toBe(1);
		expect(after.annotations.find((a) => a.origin === 'foreign')?.contents).toBe('foreign');
		expect(byId(after.annotations.filter((a) => a.origin !== 'foreign'))).toEqual(byId(remaining));
	});

	it('(4b) an edited foreign annotation is rewritten, an untouched one kept verbatim', async () => {
		const lib = await loadPdfLib();
		const doc = await lib.PDFDocument.load(original, { updateMetadata: false });
		doc.getPage(0).node.addAnnot(
			doc.context.register(
				doc.context.obj({
					Type: 'Annot',
					Subtype: 'Square',
					Rect: [10, 10, 60, 60],
					C: [1, 0, 0],
					NM: lib.PDFHexString.fromText('foreign-sq'),
					M: lib.PDFHexString.fromText('D:20250101000000Z')
				})
			)
		);
		const src = await doc.save({ useObjectStreams: false });
		const { annotations } = await importAnnotations(src);
		const sq = annotations.find((a) => a.id === 'foreign-sq')!;
		expect(sq.kind).toBe('rect');
		// Untouched: kept as is (no private data added).
		const kept = await exportPdf(src, [sq]);
		const keptPages = await pdfjsAnnotations(kept);
		expect(keptPages[1].filter((a) => a.subtype === 'Square')).toHaveLength(1);
		const reimported = (await importAnnotations(kept)).annotations.find(
			(a) => a.id === 'foreign-sq'
		)!;
		expect(reimported.origin).toBe('foreign');
		// Edited in our UI: rewritten with the new color.
		const edited = await exportPdf(src, [
			{ ...sq, color: [0, 0, 1], modifiedAt: new Date().toISOString() }
		]);
		const again = (await importAnnotations(edited)).annotations.find((a) => a.id === 'foreign-sq')!;
		expect(again.color).toEqual([0, 0, 1]);
	});

	it('(4c) an edited foreign annotation without /M is rewritten too', async () => {
		const lib = await loadPdfLib();
		const doc = await lib.PDFDocument.load(original, { updateMetadata: false });
		doc.getPage(0).node.addAnnot(
			doc.context.register(
				doc.context.obj({
					Type: 'Annot',
					Subtype: 'Square',
					Rect: [10, 10, 60, 60],
					C: [1, 0, 0],
					NM: lib.PDFHexString.fromText('foreign-no-m')
				})
			)
		);
		const src = await doc.save({ useObjectStreams: false });
		const sq = (await importAnnotations(src)).annotations.find((a) => a.id === 'foreign-no-m')!;
		const edited = await exportPdf(src, [
			{ ...sq, color: [0, 0, 1], modifiedAt: new Date().toISOString() }
		]);
		const again = (await importAnnotations(edited)).annotations.find(
			(a) => a.id === 'foreign-no-m'
		)!;
		expect(again.color).toEqual([0, 0, 1]);
	});

	it('(5) edits made in another app (newer /M) win over stored fields', async () => {
		const edited = await mutate(exported, (dict, lib) => {
			const nm = dict.lookup(lib.PDFName.of('NM'));
			if (nm instanceof lib.PDFHexString && nm.decodeText() === 'hl-title') {
				dict.set(lib.PDFName.of('C'), dict.context.obj([0, 0, 1]));
				dict.set(lib.PDFName.of('M'), lib.PDFHexString.fromText('D:20300101120000Z'));
				dict.set(lib.PDFName.of('Contents'), lib.PDFHexString.fromText('edited in Preview'));
			}
		});
		const { annotations } = await importAnnotations(edited);
		const hl = annotations.find((a) => a.id === 'hl-title')!;
		expect(hl.color).toEqual([0, 0, 1]);
		expect(hl.contents).toBe('edited in Preview');
		expect(hl.modifiedAt).toBe('2030-01-01T12:00:00.000Z');
		// Fields PDF cannot express survive.
		expect(hl.tags).toEqual(['title']);
		expect(hl.extra).toEqual({ reviewer: true, score: 3 });
		// Others untouched.
		expect(byId(annotations.filter((a) => a.id !== 'hl-title'))).toEqual(
			byId(samples.filter((a) => a.id !== 'hl-title'))
		);
	});

	it('(6) matches annotations whose /NM and private data were stripped', async () => {
		const stripped = await mutate(exported, (dict, lib) => {
			dict.delete(lib.PDFName.of('NM'));
			dict.delete(lib.PDFName.of(PRIVATE_KEY));
		});
		const { annotations, foreign } = await importAnnotations(stripped);
		expect(foreign).toBe(0);
		expect(byId(annotations).map((a) => a.id)).toEqual(byId(samples).map((a) => a.id));
		expect(byId(annotations)).toEqual(byId(samples));
	});

	it('(7) exports JSON and Markdown', () => {
		const json = annotationsToJSON(samples, { fingerprint: 'abc' });
		const parsed = JSON.parse(json);
		expect(parsed).toMatchObject({ schema: 1, generator: 'svelte-pdf-mini', fingerprint: 'abc' });
		expect(annotationsFromJSON(json)).toEqual(samples);
		expect(() => annotationsFromJSON({ schema: 99, annotations: [] } as never)).toThrow(/newer/);
		const md = annotationsToMarkdown(samples, {
			title: 'Attention Is All You Need',
			sections: [
				{ title: 'Abstract', page: 1, y: 520 },
				{ title: '1 Introduction', page: 2, y: 760 }
			]
		});
		expect(md).toMatchSnapshot();
	});

	it('flattens annotations into the page content', async () => {
		const flat = await exportPdf(original, samples, { flatten: true, mode: 'full' });
		writeFileSync(`${OUT_DIR}attention-flattened.pdf`, flat);
		const pages = await pdfjsAnnotations(flat);
		const remaining = Object.values(pages)
			.flat()
			.filter((a) => a.subtype !== 'Link');
		expect(remaining).toEqual([]);
		const { annotations } = await importAnnotations(flat);
		expect(annotations).toEqual([]);
		// Drawn: page 2 now paints one form XObject per annotation.
		const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
		const task = getDocument({ data: flat.slice(), verbosity: 0 });
		const doc = await task.promise;
		const ops = await (await doc.getPage(2)).getOperatorList();
		expect(
			ops.fnArray.filter((f) => f === OPS.paintFormXObjectBegin).length
		).toBeGreaterThanOrEqual(samples.filter((a) => a.page === 2).length);
		await task.destroy();
	});

	it('writes image stamps', async () => {
		const stamp = {
			...samples.find((a) => a.id === 'stamp-1')!,
			id: 'img-stamp',
			image: RED_PNG
		} as Annotation;
		const out = await exportPdf(original, [stamp]);
		writeFileSync(`${OUT_DIR}attention-image-stamp.pdf`, out);
		const { annotations } = await importAnnotations(out);
		expect(annotations).toEqual([stamp]);
		const pages = await pdfjsAnnotations(out);
		expect(pages[2].find((a) => a.subtype === 'Stamp')?.hasAppearance).toBe(true);
	});

	it.skipIf(!hasQpdf())('passes qpdf --check', () => {
		const file = `${OUT_DIR}attention-annotated.pdf`;
		const out = execFileSync('qpdf', ['--check', file], { encoding: 'utf8' });
		expect(out).toMatch(/No syntax or stream encoding errors/);
	});
});

function hasQpdf() {
	try {
		execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
