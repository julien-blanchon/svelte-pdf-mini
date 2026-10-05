# svelte-pdf-mini

Headless, composable PDF viewer and **research-paper reader** components for **Svelte 5** (runes), built on **pdf.js 6**.

**[Documentation & live demos](https://julien-blanchon.github.io/svelte-pdf-mini)** · [GitHub](https://github.com/julien-blanchon/svelte-pdf-mini) · [Changelog](https://github.com/julien-blanchon/svelte-pdf-mini/blob/main/packages/svelte-pdf-mini/CHANGELOG.md)

- **Viewer:** virtualised pages, smooth zoom (centered while narrow, under the cursor once wide), fit modes, 1–4 pages per row or `auto`, book spreads, rotation, pinch-zoom on touch, `focus()` on any page, region, destination or annotation with highlight effects, back/forward history.
- **Text:** selectable text layer, a text index (normalized text ↔ PDF geometry), find (ignores case, accents, ligatures and line-break hyphens), clean copy.
- **Page themes:** invert, smart invert (figures kept), vector recolor (hues kept), dim, sepia, duotone recolor, tinted paper colors per category (with night variants), or your own strategy.
- **Annotations:** highlight / underline / strike-out / squiggly, area boxes with labels, notes, ink, shapes, arrows, free text, side notes in the margin, gutter markers, hover cards, threads, undo/redo, read-only and foreign-annotation policies.
- **PDF round trip:** export standard PDF annotations with appearance streams (Apple Preview, Acrobat, Chrome, Firefox) and re-import them losslessly; Markdown and JSON export; re-anchoring by quote.
- **Research papers:** sections (outline or headings), references, in-text citations with hover cards and online enrichment (OpenAlex, Semantic Scholar, Crossref), figure/table index, "Fig. 3" / "Section 2" links with previews, five table-of-contents views, reading progress.

```sh
bun add svelte-pdf-mini   # or npm i / pnpm add
```

```ts
// vite.config.ts: required for `vite dev` (the pdf.js worker can't be pre-bundled)
import { defineConfig } from 'vite';

export default defineConfig({
	optimizeDeps: { exclude: ['pdfjs-dist'] }
});
```

```svelte
<script>
	import { Document, Viewer, Annotations, Paper } from 'svelte-pdf-mini';
	import 'svelte-pdf-mini/styles.css';
	let annotations = $state([]);
</script>

<Document.Root src="https://arxiv.org/pdf/1706.03762">
	<Viewer.Root zoomMode="page-width" style="height: 100vh">
		<Paper.Root>
			<Annotations.Root bind:annotations>
				<Viewer.Viewport style="height: 100%">
					<Viewer.Pages>
						{#snippet children({ pageNumber })}
							<Viewer.Page {pageNumber}>
								<Viewer.Canvas />
								<Viewer.TextLayer />
								<Paper.Layer />
								<Annotations.Layer />
							</Viewer.Page>
						{/snippet}
					</Viewer.Pages>
				</Viewer.Viewport>
				<Annotations.SelectionMenu />
				<Annotations.Popover />
				<Paper.CitationCard />
			</Annotations.Root>
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
```

## Namespaces

| Namespace               | Parts                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Document`              | `Root`, `Loading`, `Error`, `Password`                                                                                                                    |
| `Viewer`                | `Root`, `Viewport`, `Pages`, `Page`, `Canvas`, `TextLayer`, `LinkLayer`, `LinkPreview`, `Focus`, `BackButton`                                             |
| `Zoom`, `PageNav`       | `In`, `Out`, `Mode`, `Select` · `Prev`, `Next`, `Input`                                                                                                   |
| `Find`                  | `Root`, `Input`, `Next`, `Prev`, `Toggle`, `Count`, `Result`, `Layer`                                                                                     |
| `Outline`, `Thumbnails` | `Root`, `Tree`, `Item` · `Root`, `Item`                                                                                                                   |
| `Annotations`           | `Root`, `Layer`, `SelectionMenu`, `Popover`, `HoverCard`, `Margin`, `LineMarkers`, `List`, `Crop`, `Comment`, `Markdown`, `Tool`, `Color`, `Undo`, `Redo` |
| `Paper`                 | `Root`, `Layer`, `CitationCard`, `CrossRefPreview`, `Backlinks`, `References`, `Figures`, `Headings`                                                      |
| `Toc`, `Minimap`        | `Tree`, `Flat`, `Breadcrumb`, `Progress`, `Rail` · `Root`, `Viewport`, `Markers`, `Heatmap`                                                               |
| `Shortcut`              | `Root`                                                                                                                                                    |

Every part accepts `class`, `style` and other attributes (event handlers are chained), a bindable `ref`, a `child` snippet to render your own element, and `children` with snippet props. Parts are unstyled: target `data-pdf-*` attributes (the optional `styles.css` gives sensible defaults through CSS variables).

## Entry points

| Import                       | What                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte-pdf-mini`            | Components, state classes and core                                                                                                                            |
| `svelte-pdf-mini/state`      | State classes only: `PdfDocument`, `ViewerState`, `PageState`, `FindState`, `OutlineState`, `AnnotationStore`, `PaperState`, `MinimapState`, `ThumbnailCache` |
| `svelte-pdf-mini/core`       | Plain TypeScript: text index, search, geometry, page themes, PDF codec, paper analysis, citation providers, clipboard                                         |
| `svelte-pdf-mini/pdf-codec`  | Read / write annotations in PDF files, JSON and Markdown export (no Svelte, works in workers)                                                                 |
| `svelte-pdf-mini/styles.css` | Optional default styles                                                                                                                                       |

## Styling

`styles.css` and every component style sit in the `svelte-pdf-mini` cascade layer, so any unlayered CSS of yours overrides them. With Tailwind v4, utilities should win too. Declare the layer order **in your HTML `<head>`, before any stylesheet**: a layer's rank is fixed by its first mention, and component styles can load before your CSS (a later declaration in `app.css` then comes too late, and Tailwind's base reset would override the library).

```html
<!-- app.html -->
<style>
	@layer theme, base, svelte-pdf-mini, components, utilities;
</style>
```

```css
/* app.css */
@import 'tailwindcss';
@import 'svelte-pdf-mini/styles.css';
```

## pdf.js assets (Webpack, Rspack, desktop and offline apps)

The pdf.js worker comes from a Vite `?url` import, and character maps, standard fonts, wasm and ICC profiles load from jsDelivr. Outside Vite, offline, or in a desktop shell (Tauri, Electron), serve them yourself and call `configurePdf` before the first document loads:

```ts
import { configurePdf } from 'svelte-pdf-mini';

configurePdf({
	workerSrc: '/pdfjs/pdf.worker.min.mjs', // or workerPort: new Worker(…)
	cMapUrl: '/pdfjs/cmaps/',
	standardFontDataUrl: '/pdfjs/standard_fonts/',
	wasmUrl: '/pdfjs/wasm/',
	iccUrl: '/pdfjs/iccs/'
});
```

Copy those folders from `node_modules/pdfjs-dist/` (`build/pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`, `wasm/`, `iccs/`).

Targets the latest evergreen browsers. [MIT](https://github.com/julien-blanchon/svelte-pdf-mini/blob/main/LICENSE) © Julien Blanchon.
