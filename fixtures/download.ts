// bun fixtures/download.ts — caches arXiv test PDFs in fixtures/cache (not committed).
import { mkdir } from 'node:fs/promises';
import papers from './papers.json';

const dir = new URL('./cache/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });
for (const p of papers) {
	const out = Bun.file(dir + p.file);
	if (await out.exists()) continue;
	const res = await fetch(`https://arxiv.org/pdf/${p.id}`);
	if (!res.ok) throw new Error(`${p.id}: HTTP ${res.status}`);
	await Bun.write(out, await res.arrayBuffer());
	console.log('downloaded', p.file);
}
