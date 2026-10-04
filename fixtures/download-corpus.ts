// bun fixtures/download-corpus.ts — caches the evaluation corpus in fixtures/cache/corpus (not committed).
import { mkdir } from 'node:fs/promises';
import corpus from './corpus.json';

const dir = new URL('./cache/corpus/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });
const file = (id: string) => `${id.replace('/', '_')}.pdf`;
let n = 0;
await Promise.all(
	corpus.map(async (p, i) => {
		await Bun.sleep(i * 250); // be gentle with arxiv.org
		const out = Bun.file(dir + file(p.id));
		if (await out.exists()) return;
		const res = await fetch(`https://arxiv.org/pdf/${p.id}`);
		if (!res.ok) return console.warn(`${p.id}: HTTP ${res.status}`);
		await Bun.write(out, await res.arrayBuffer());
		n++;
	})
);
console.log(`downloaded ${n}, corpus ${corpus.length}`);
