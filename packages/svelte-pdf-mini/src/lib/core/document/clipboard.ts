/** Clipboard helpers (rich text + images), with plain-text fallbacks. */

/** Copy text, optionally with an HTML flavour (pasted with formatting where supported). */
export async function copyRich(plain: string, html?: string, markdown?: string): Promise<void> {
	const text = markdown ?? plain;
	if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
		await navigator.clipboard.write([
			new ClipboardItem({
				'text/plain': new Blob([text], { type: 'text/plain' }),
				'text/html': new Blob([html], { type: 'text/html' })
			})
		]);
		return;
	}
	await navigator.clipboard.writeText(text);
}

/** Copy a canvas as a PNG image. */
export async function copyCanvasImage(canvas: HTMLCanvasElement): Promise<void> {
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) throw new Error('svelte-pdf-mini: could not encode image');
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Download a canvas as a PNG file. */
export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
	canvas.toBlob((blob) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = Object.assign(document.createElement('a'), { href: url, download: name });
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	}, 'image/png');
}
