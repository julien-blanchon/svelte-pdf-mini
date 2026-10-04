/**
 * Apple Preview interop, simulated with PDFKit (the framework Preview uses).
 * macOS only; skipped elsewhere. Findings encoded here: PDFKit keeps unknown
 * keys (/SPM_Data) and /AP, but drops /NM, /M (unless edited), /CA, /RC, /IRT,
 * embedded files, and /QuadPoints on Squiggly.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Annotation } from '../annotations/model.js';
import { exportPdf, importAnnotations } from './index.js';
import { loadAttention, sampleAnnotations } from './samples.test.helper.js';

const SIM = fileURLToPath(new URL('./preview-sim.test.helper.swift', import.meta.url));
const canRun = (() => {
	if (process.platform !== 'darwin') return false;
	try {
		execFileSync('swift', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

const byId = (list: Annotation[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

function preview(mode: 'resave' | 'highlight' | 'recolor', bytes: Uint8Array): Uint8Array {
	const dir = mkdtempSync(join(tmpdir(), 'spm-preview-'));
	const src = join(dir, 'in.pdf');
	const out = join(dir, 'out.pdf');
	writeFileSync(src, bytes);
	execFileSync('swift', [SIM, mode, src, out], { stdio: 'ignore' });
	return new Uint8Array(readFileSync(out));
}

/** CoreGraphics parse errors (Preview's parser) for a file. */
function coreGraphicsErrors(bytes: Uint8Array): string[] {
	const dir = mkdtempSync(join(tmpdir(), 'spm-cg-'));
	const file = join(dir, 'f.pdf');
	writeFileSync(file, bytes);
	const out = execFileSync(
		'sips',
		['-s', 'format', 'png', '-Z', '200', file, '--out', join(dir, 'f.png')],
		{
			env: { ...process.env, CG_PDF_VERBOSE: '1' },
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	return out.split('\n').filter((l) => /invalid|unexpected|missing|error/i.test(l));
}

describe.skipIf(!canRun)('Apple Preview (PDFKit) interop', () => {
	let original: Uint8Array;
	let samples: Annotation[];
	let exported: Uint8Array;

	beforeAll(async () => {
		const { bytes, text1, text2 } = await loadAttention();
		original = bytes;
		samples = sampleAnnotations(text1, text2);
		exported = await exportPdf(original, samples);
	}, 60_000);

	it('our incremental and full exports parse cleanly in CoreGraphics', async () => {
		expect(coreGraphicsErrors(exported)).toEqual([]);
		expect(coreGraphicsErrors(await exportPdf(original, samples, { mode: 'full' }))).toEqual([]);
	}, 60_000);

	it('survives a Preview re-save losslessly (via /SPM_Data)', async () => {
		const resaved = preview('resave', exported);
		const { annotations, foreign } = await importAnnotations(resaved);
		expect(foreign).toBe(0);
		expect(byId(annotations)).toEqual(byId(samples));
	}, 60_000);

	it('picks up a colour change made in Preview, keeping opacity and private fields', async () => {
		const recolored = preview('recolor', exported);
		const { annotations } = await importAnnotations(recolored);
		const hl = annotations.find((a) => a.id === 'hl-title')!;
		expect(hl.color).toEqual([0, 0, 1]);
		expect(hl.opacity).toBe(0.5); // /CA was dropped by PDFKit: stored value kept
		expect(hl.tags).toEqual(['title']);
		expect(hl.modifiedAt).not.toBe(samples.find((a) => a.id === 'hl-title')!.modifiedAt);
		const sq = annotations.find((a) => a.id === 'sq-1')!;
		expect(sq).toEqual(samples.find((a) => a.id === 'sq-1')); // squiggly quads were dropped, not changed
	}, 60_000);

	it('imports highlights and notes created in Preview as foreign annotations', async () => {
		const created = preview('highlight', original);
		const { annotations, foreign } = await importAnnotations(created);
		expect(foreign).toBe(2);
		const hl = annotations.find((a) => a.kind === 'highlight')!;
		expect(hl).toMatchObject({
			origin: 'foreign',
			page: 1,
			contents: 'made in Preview',
			author: { name: 'Preview User' }
		});
		expect((hl as { quads: number[][] }).quads).toEqual([[100, 414, 300, 414, 100, 400, 300, 400]]);
		expect(annotations.find((a) => a.kind === 'note')?.contents).toBe('preview note');
	}, 60_000);

	it('re-exporting a Preview-saved file replaces our annotations without duplicates', async () => {
		const resaved = preview('resave', exported);
		const again = await exportPdf(resaved, samples);
		const { annotations, foreign } = await importAnnotations(again);
		expect(foreign).toBe(0);
		expect(byId(annotations)).toEqual(byId(samples));
		expect(coreGraphicsErrors(again)).toEqual([]);
	}, 60_000);
});
