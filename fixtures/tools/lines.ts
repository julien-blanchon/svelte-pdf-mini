// bun fixtures/tools/lines.ts <pdf> <page> [ymin] [ymax] — text lines with geometry (debugging analysis).
import { getDocument } from '../../packages/svelte-pdf-mini/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { PageText } from '../../packages/svelte-pdf-mini/src/lib/core/text-index.ts';
import { pageLines } from '../../packages/svelte-pdf-mini/src/lib/core/paper/lines.ts';
const [file, pg, ymin = '0', ymax = '9999'] = process.argv.slice(2);
const data = new Uint8Array(await Bun.file(file).arrayBuffer());
const doc = await getDocument({ data, verbosity: 0 }).promise;
const page = await doc.getPage(Number(pg));
const lines = pageLines(new PageText(Number(pg), await page.getTextContent()));
for (const l of lines) if (l.top >= +ymin && l.bottom <= +ymax) console.log(`${l.bottom.toFixed(0)}-${l.top.toFixed(0)} x${l.x.toFixed(0)}-${l.right.toFixed(0)} s${l.size.toFixed(1)} | ${l.text.slice(0, 80)}`);
