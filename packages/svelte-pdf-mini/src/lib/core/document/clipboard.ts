/** Clipboard helpers (rich text + images), with plain-text fallbacks. */

/** Where copies go. Defaults to the async Clipboard API; see `setClipboard`. */
export interface ClipboardWriter {
	text(text: string): Promise<void>;
	/** Plain text with an HTML flavour (pasted with formatting where supported). */
	rich(text: string, html: string): Promise<void>;
	image(png: Blob): Promise<void>;
}

const browserClipboard: ClipboardWriter = {
	text: (text) => navigator.clipboard.writeText(text),
	async rich(text, html) {
		if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return this.text(text);
		await navigator.clipboard.write([
			new ClipboardItem({
				'text/plain': new Blob([text], { type: 'text/plain' }),
				'text/html': new Blob([html], { type: 'text/html' })
			})
		]);
	},
	image: (png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
};

let writer = browserClipboard;

/**
 * Send every copy (menus, ⌘C on a text selection) through your own clipboard,
 * e.g. a native one in a desktop shell. Missing methods keep the default.
 */
export function setClipboard(custom: Partial<ClipboardWriter> | null) {
	writer = custom ? { ...browserClipboard, ...custom } : browserClipboard;
}

/** Was a custom clipboard installed (then ⌘C goes through it too)? */
export const hasCustomClipboard = () => writer !== browserClipboard;

/** Copy plain text. */
export const copyText = (text: string) => writer.text(text);

/** Copy text, optionally with an HTML flavour (pasted with formatting where supported). */
export async function copyRich(plain: string, html?: string, markdown?: string): Promise<void> {
	const text = markdown ?? plain;
	return html ? writer.rich(text, html) : writer.text(text);
}

/** Encode a canvas as a PNG blob. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!blob) throw new Error('svelte-pdf-mini: could not encode image');
	return blob;
}

/** Copy a canvas as a PNG image. */
export async function copyCanvasImage(canvas: HTMLCanvasElement): Promise<void> {
	await writer.image(await canvasToPng(canvas));
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
