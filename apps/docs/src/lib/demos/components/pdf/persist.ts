import type { Annotation } from 'svelte-pdf-mini';

/** localStorage persistence for annotations, keyed by the PDF fingerprint (stable across URLs). */
const key = (fingerprint: string, ns: string) => `svelte-pdf-mini:${ns}:${fingerprint}`;

export function loadAnnotations(fingerprint: string | null, ns = 'annotations'): Annotation[] {
	if (!fingerprint) return [];
	try {
		const raw = localStorage.getItem(key(fingerprint, ns));
		return raw ? (JSON.parse(raw) as Annotation[]) : [];
	} catch {
		return [];
	}
}

export function saveAnnotations(fingerprint: string | null, list: Annotation[], ns = 'annotations') {
	if (!fingerprint) return;
	try {
		localStorage.setItem(key(fingerprint, ns), JSON.stringify(list));
	} catch {
		/* storage full or unavailable: persistence is best-effort */
	}
}

export function download(data: Uint8Array | string, name: string, type: string) {
	const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
