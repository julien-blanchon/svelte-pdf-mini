import type { KnipConfig } from 'knip';

/** The imports of an mdsvex page: its `<script>` blocks (code fences are examples, not code). */
const svxScripts = (text: string) =>
	[...text.replace(/```[\s\S]*?```/g, '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
		.map((m) => m[1])
		.join(';\n');

export default {
	workspaces: {
		'.': {
			// Manual tools: `bun fixtures/<script>.ts`. They load the library package's pdf.js and canvas.
			entry: ['fixtures/*.ts', 'fixtures/tools/*.ts'],
			ignoreDependencies: ['pdfjs-dist', '@napi-rs/canvas']
		},
		'packages/svelte-pdf-mini': {
			// pdf.js' Node build loads it to render (tests, fixture scripts).
			ignoreDependencies: ['@napi-rs/canvas']
		},
		'apps/docs': {
			// Icon set read by the @iconify/tailwind4 plugin for `icon-[lucide--…]` classes.
			ignoreDependencies: ['@iconify-json/lucide']
		}
	},
	// System tools called by the slow tests (skipped when missing).
	ignoreBinaries: ['qpdf', 'swift', 'sips'],
	compilers: { svx: svxScripts }
} satisfies KnipConfig;
