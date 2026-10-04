/** Test helpers: load cached arXiv fixtures with pdf.js (legacy build for Node). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const fixturePath = (file: string) =>
	fileURLToPath(new URL(`../../../../../fixtures/cache/${file}`, import.meta.url));

export async function openFixture(file: string) {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const data = new Uint8Array(readFileSync(fixturePath(file)));
	return getDocument({ data, verbosity: 0 }).promise;
}
