// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {}
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
	const url: string;
	export default url;
}

export {};
