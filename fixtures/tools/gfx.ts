// bun fixtures/tools/gfx.ts <pdf> <page> — images, drawings and rules found on a page.
import { getDocument } from '../../packages/svelte-pdf-mini/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { pageGraphics } from '../../packages/svelte-pdf-mini/src/lib/core/document/image-boxes.ts';
const data = new Uint8Array(await Bun.file(process.argv[2]).arrayBuffer());
const doc = await getDocument({ data, verbosity: 0 }).promise;
const page = await doc.getPage(Number(process.argv[3]));
const g = await pageGraphics(page);
const f = (r: number[]) => r.map(Math.round).join(',');
console.log('view', page.view.join(','));
console.log('images', g.images.map(f));
console.log('drawings', g.drawings.map(f));
console.log('rules', g.rules.length, g.rules.slice(0, 12).map(f));
