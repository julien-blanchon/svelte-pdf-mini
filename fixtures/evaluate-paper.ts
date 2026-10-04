/**
 * Evaluate `analyzePaper` on the corpus (bun fixtures/evaluate-paper.ts [--crops] [--only <id,id>] [--json out.json]).
 *
 * Per paper: sections (intro/conclusion/references found?), references and the
 * fraction cited, citations resolved, captioned figures/tables found vs. captions
 * seen in the text, suspicious boxes, cross-refs resolved, time. Anomalies are
 * flagged. With --crops, figure/table crops are rendered to fixtures/out/crops/.
 */
import { mkdir } from 'node:fs/promises';
import { getDocument } from '../packages/svelte-pdf-mini/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '../packages/svelte-pdf-mini/node_modules/@napi-rs/canvas';
import { analyzePaper, flattenSections, pageLines, pdfjsPaperSource } from '../packages/svelte-pdf-mini/src/lib/core/paper/index.ts';
import { pageGraphics } from '../packages/svelte-pdf-mini/src/lib/core/image-boxes.ts';
import corpus from './corpus.json';

const args = process.argv.slice(2);
const crops = args.includes('--crops');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const cacheDir = new URL('./cache/corpus/', import.meta.url).pathname;
const extra = [
	{ id: 'attention', file: new URL('./cache/attention.pdf', import.meta.url).pathname },
	{ id: 'resnet', file: new URL('./cache/resnet.pdf', import.meta.url).pathname },
	{ id: 'gpt3', file: new URL('./cache/gpt3.pdf', import.meta.url).pathname },
	{ id: 'vae', file: new URL('./cache/vae.pdf', import.meta.url).pathname },
	{ id: 'maldacena', file: new URL('./cache/maldacena.pdf', import.meta.url).pathname },
	{ id: '2601.05637', file: new URL('./cache/2601.05637.pdf', import.meta.url).pathname }
];
const papers = [...extra, ...corpus.map((p) => ({ id: p.id, file: `${cacheDir}${p.id.replace('/', '_')}.pdf` }))].filter(
	(p) => !only || only.includes(p.id)
);

const CAPTION_RE = /^(Figure|Fig\.?|Table)\s*(\d+(?:\.\d+)*)\s*(?:[:.|]|\s+[-–—]\s|\s+(?=\p{Lu}))/iu;
const STOP = new Set('the of and to in a is for we that with on are by as this be from an which our it at can these not'.split(' '));
const isProse = (t: string) => {
	const w = t.trim().split(/\s+/);
	return w.length >= 7 && w.filter((x) => STOP.has(x.toLowerCase())).length >= 2;
};
const area = (r: number[]) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const inside = (r: number[], b: number[], pad = 1) => r[0] >= b[0] - pad && r[1] >= b[1] - pad && r[2] <= b[2] + pad && r[3] <= b[3] + pad;

interface Row {
	id: string;
	pages: number;
	ms: number;
	sections: number;
	intro: boolean;
	concl: boolean;
	refsHeading: boolean;
	refs: number;
	cited: number;
	citations: number;
	resolved: number;
	captions: number;
	found: number;
	withBody: number;
	suspicious: string[];
	bracket: number;
	bracketHit: number;
	xrefs: number;
	xrefsResolved: number;
	flags: string[];
}

const rows: Row[] = [];
for (const p of papers) {
	if (!(await Bun.file(p.file).exists())) continue;
	const data = new Uint8Array(await Bun.file(p.file).arrayBuffer());
	const task = getDocument({ data, verbosity: 0 });
	const doc = await task.promise;
	const src = pdfjsPaperSource(doc);
	let m;
	try {
		m = await analyzePaper(src);
	} catch (e) {
		console.log(`${p.id}: FAILED ${(e as Error).message}`);
		continue;
	}
	// Captions seen in the text (first occurrence per kind+number, line-initial).
	const captions = new Set<string>();
	for (let n = 1; n <= doc.numPages; n++) {
		for (const l of pageLines(await src.getPageText(n))) {
			if (l.rotated) continue;
			const c = CAPTION_RE.exec(l.text.trim());
			if (c) captions.add(`${/^tab/i.test(c[1]) ? 'table' : 'figure'}:${c[2]}`);
		}
	}
	// Numeric citation recall: bracket groups like [12] / [3, 5–7] before the references.
	const refPage = m.references[0]?.page ?? doc.numPages + 1;
	let bracket = 0;
	let bracketHit = 0;
	for (let n = 1; n < refPage; n++) {
		const t = await src.getPageText(n);
		for (const mm of t.raw.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
			const nums = mm[1].split(/[,–-]/).map((x) => Number(x.trim()));
			if (nums.some((x) => x > m.references.length + 5 || x === 0)) continue; // equations, years…
			bracket++;
			if (m.citations.some((c) => c.page === n && c.start <= mm.index + 1 && c.end >= mm.index + mm[0].length - 1)) bracketHit++;
		}
	}
	const found = new Set(m.figures.filter((f) => f.kind !== 'algorithm').map((f) => `${f.kind}:${f.number}`));
	const suspicious: string[] = [];
	let withBody = 0;
	for (const f of m.figures) {
		const page = await doc.getPage(f.page);
		const [, , pw, ph] = page.view;
		const capOnly = f.rect[3] - f.rect[1] - (f.captionRect[3] - f.captionRect[1]) < 25;
		const tooBig = area(f.rect) > pw * ph * 0.8;
		const lines = pageLines(await src.getPageText(f.page)).filter((l) => !l.rotated);
		const proseInside = lines.filter(
			(l) => inside([l.x, l.bottom, l.right, l.top], f.rect) && !inside([l.x, l.bottom, l.right, l.top], f.captionRect, 2) && isProse(l.text)
		).length;
		let noRule = false;
		if (f.kind === 'table') {
			const g = await pageGraphics(page);
			const ruled = g.rules.some((r) => inside(r, f.rect, 3));
			const textRows = lines.filter((l) => inside([l.x, l.bottom, l.right, l.top], f.rect) && !inside([l.x, l.bottom, l.right, l.top], f.captionRect, 2)).length;
			noRule = !ruled && textRows < 3;
		}
		const why = [capOnly && 'caption-only', tooBig && 'too-big', proseInside > 2 && `prose×${proseInside}`, noRule && 'no-rows'].filter(Boolean);
		if (!capOnly) withBody++;
		if (why.length) suspicious.push(`${f.label}(p${f.page}):${why.join('+')}`);
		if (crops) {
			const dir = new URL(`./out/crops/${p.id.replace('/', '_')}/`, import.meta.url).pathname;
			await mkdir(dir, { recursive: true });
			const pad = 6;
			const r = [f.rect[0] - pad, f.rect[1] - pad, f.rect[2] + pad, f.rect[3] + pad];
			const scale = 1.6;
			const vp = page.getViewport({ scale });
			const [ax, ay] = vp.convertToViewportPoint(r[0], r[3]);
			const [bx, by] = vp.convertToViewportPoint(r[2], r[1]);
			const w = Math.max(1, Math.round(bx - ax));
			const h = Math.max(1, Math.round(by - ay));
			const canvas = createCanvas(w, h);
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, w, h);
			const cropVp = page.getViewport({ scale, offsetX: -ax, offsetY: -ay });
			await page.render({ canvasContext: ctx as never, viewport: cropVp, canvas: null as never }).promise.catch(() => {});
			await Bun.write(`${dir}${f.id}.png`, await canvas.encode('png'));
		}
	}
	const flat = flattenSections(m.sections);
	const has = (re: RegExp) => flat.some((s) => re.test(s.title));
	const cited = new Set(m.citations.flatMap((c) => c.referenceIds));
	const row: Row = {
		id: p.id,
		pages: doc.numPages,
		ms: m.timeMs,
		sections: flat.length,
		intro: has(/introduction/i),
		concl: has(/conclusion|discussion|summary/i),
		refsHeading: flat.some((s) => s.kind === 'references') || has(/references|bibliography/i),
		refs: m.references.length,
		cited: m.references.length ? cited.size / m.references.length : 0,
		citations: m.citations.length,
		resolved: m.citations.length ? m.citations.filter((c) => c.referenceIds.length).length / m.citations.length : 1,
		captions: captions.size,
		found: [...captions].filter((c) => found.has(c)).length,
		withBody,
		suspicious,
		bracket,
		bracketHit,
		xrefs: m.crossRefs.length,
		xrefsResolved: m.crossRefs.filter((x) => x.target || x.targetId).length,
		flags: []
	};
	if (!row.refs) row.flags.push('NO-REFS');
	else if (row.cited < 0.6) row.flags.push(`low-cited ${(row.cited * 100).toFixed(0)}%`);
	if (m.citationStyle === 'numeric' && row.bracket > 5 && row.bracketHit / row.bracket < 0.9) row.flags.push(`cite-recall ${row.bracketHit}/${row.bracket}`);
	if (row.resolved < 0.95) row.flags.push(`unresolved-cites ${(100 - row.resolved * 100).toFixed(0)}%`);
	if (row.captions && row.found / row.captions < 0.95) row.flags.push(`figs ${row.found}/${row.captions}`);
	if (!row.intro) row.flags.push('no-intro');
	if (row.ms > 3000) row.flags.push(`slow ${row.ms}ms`);
	if (suspicious.length) row.flags.push(`suspicious×${suspicious.length}`);
	rows.push(row);
	console.log(
		`${p.id.padEnd(16)} ${String(row.pages).padStart(3)}p ${String(row.ms).padStart(5)}ms sec ${String(row.sections).padStart(3)}${row.intro ? 'I' : '-'}${row.concl ? 'C' : '-'}${row.refsHeading ? 'R' : '-'} refs ${String(row.refs).padStart(3)} cited ${(row.cited * 100).toFixed(0).padStart(3)}% cites ${String(row.citations).padStart(4)} ok ${(row.resolved * 100).toFixed(0).padStart(3)}% [${m.citationStyle}] [n] ${row.bracketHit}/${row.bracket} figs ${row.found}/${row.captions} body ${row.withBody}/${m.figures.length} xref ${row.xrefsResolved}/${row.xrefs} ${row.flags.join(' ')}`
	);
	for (const s of suspicious) console.log(`    ${s}`);
	await task.destroy();
}

const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const caps = sum((r) => r.captions);
console.log('\n=== totals ===');
console.log(`papers ${rows.length}`);
console.log(`refs found on ${rows.filter((r) => r.refs > 0).length}/${rows.length}`);
console.log(`numeric [n] citation recall ${sum((r) => r.bracketHit)}/${sum((r) => r.bracket)}`);
console.log(`citations resolved ${((sum((r) => r.resolved * r.citations) / Math.max(1, sum((r) => r.citations))) * 100).toFixed(1)}%`);
console.log(`captioned figures/tables found ${sum((r) => r.found)}/${caps} (${((sum((r) => r.found) / Math.max(1, caps)) * 100).toFixed(1)}%)`);
console.log(`suspicious boxes ${sum((r) => r.suspicious.length)}`);
console.log(`intro found ${rows.filter((r) => r.intro).length}/${rows.length}, slow (>3s) ${rows.filter((r) => r.ms > 3000).length}`);
console.log(`cross-refs resolved ${sum((r) => r.xrefsResolved)}/${sum((r) => r.xrefs)}`);
if (jsonOut) await Bun.write(jsonOut, JSON.stringify(rows, null, 1));
