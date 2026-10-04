// bun fixtures/tools/figures.ts <pdf> ["Table 3,Figure 1"] — figure/table boxes found by analyzePaper.
import { getDocument } from '../../packages/svelte-pdf-mini/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyzePaper, pdfjsPaperSource } from '../../packages/svelte-pdf-mini/src/lib/core/paper/index.ts';
const data = new Uint8Array(await Bun.file(process.argv[2]).arrayBuffer());
const doc = await getDocument({ data, verbosity: 0 }).promise;
const m = await analyzePaper(pdfjsPaperSource(doc));
const only = process.argv[3]?.split(',');
for (const f of m.figures) if (!only || only.includes(f.label)) console.log(f.label, 'p' + f.page, f.source, 'cap', f.captionRect.map(Math.round).join(','), 'box', f.rect.map(Math.round).join(','), '|', f.caption.slice(0, 60));
