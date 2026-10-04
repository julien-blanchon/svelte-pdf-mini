/**
 * `ReadableStream` async iteration (`for await (const chunk of stream)`).
 *
 * pdf.js 6 reads text content this way, on the main thread and in its worker.
 * Current WKWebView (the macOS 26 system webview behind Tauri and other
 * desktop shells) doesn't ship it yet, although Safari does: without it
 * `getTextContent()` throws, so there is no text layer, selection or search.
 *
 * This installs the standard `values()` / `[Symbol.asyncIterator]` only when
 * missing; it is a no-op everywhere else and can go once WKWebView catches up.
 */
export function installStreamIteration(): void {
	if (typeof ReadableStream === 'undefined') return;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const proto = ReadableStream.prototype as any;
	if (typeof proto[Symbol.asyncIterator] === 'function') return;

	proto.values = function values(this: ReadableStream, { preventCancel = false } = {}) {
		const reader = this.getReader();
		return {
			async next() {
				const result = await reader.read();
				if (result.done) reader.releaseLock();
				return result;
			},
			async return(value?: unknown) {
				if (preventCancel) reader.releaseLock();
				else {
					const cancelled = reader.cancel(value);
					reader.releaseLock();
					await cancelled;
				}
				return { done: true, value };
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	};
	proto[Symbol.asyncIterator] = proto.values;
}

/** True when this engine needs the shim (main thread and workers share the engine). */
export function needsStreamIteration(): boolean {
	return (
		typeof ReadableStream !== 'undefined' &&
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		typeof (ReadableStream.prototype as any)[Symbol.asyncIterator] !== 'function'
	);
}

/**
 * A module worker URL that installs the shim, then runs the pdf.js worker
 * at `workerSrc`.
 */
export function workerWithStreamIteration(workerSrc: string): string {
	const absolute = new URL(workerSrc, globalThis.location?.href).href;
	const source = `(${installStreamIteration.toString()})();\nawait import(${JSON.stringify(absolute)});\n`;
	return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
}
