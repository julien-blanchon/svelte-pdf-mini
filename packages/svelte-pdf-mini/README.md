# svelte-pdf-mini

Headless, composable PDF viewer and **research-paper reader** components for **Svelte 5** (runes), built on **pdf.js 6**.

**[Documentation & live demos](https://julien-blanchon.github.io/svelte-pdf-mini)** · [GitHub](https://github.com/julien-blanchon/svelte-pdf-mini) · [Changelog](https://github.com/julien-blanchon/svelte-pdf-mini/blob/main/packages/svelte-pdf-mini/CHANGELOG.md)

- **Viewer:** virtualised pages, smooth zoom (centred while narrow, under the cursor once wide), fit modes, 1–4 pages per row or `auto`, book spreads, rotation, pinch-zoom on touch, `focus()` on any page, region, destination or annotation with highlight effects, back/forward history.
- **Text:** selectable text layer, a text index (normalised text ↔ PDF geometry), find (ignores case, accents, ligatures and line-break hyphens), clean copy.
- **Page themes:** invert, smart invert (figures kept), vector recolor (hues kept), dim, sepia, duotone recolor, tinted paper colours per category (with night variants), or your own strategy.
- **Annotations:** highlight / underline / strike-out / squiggly, area boxes with labels, notes, ink, shapes, arrows, free text, side notes in the margin, gutter markers, hover cards, threads, undo/redo, read-only and foreign-annotation policies.
- **PDF round trip:** export standard PDF annotations with appearance streams (Apple Preview, Acrobat, Chrome, Firefox) and re-import them losslessly; Markdown and JSON export; re-anchoring by quote.
- **Research papers:** sections (outline or headings), references, in-text citations with hover cards and online enrichment (OpenAlex, Semantic Scholar, Crossref), figure/table index, "Fig. 3" / "Section 2" links with previews, five table-of-contents views, reading progress.

```sh
bun add svelte-pdf-mini   # or npm i / pnpm add
```

```ts
// vite.config.ts: required for `vite dev` (the pdf.js worker can't be pre-bundled)
optimizeDeps: {
	exclude: ['pdfjs-dist'];
}
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

| Namespace               | Parts                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Document`              | `Root`, `Loading`, `Error`, `Password`                                                                                                        |
| `Viewer`                | `Root`, `Viewport`, `Pages`, `Page`, `Canvas`, `TextLayer`, `LinkLayer`, `LinkPreview`, `Focus`, `BackButton`                                 |
| `Zoom`, `PageNav`       | `In`, `Out`, `Mode`, `Select` · `Prev`, `Next`, `Input`                                                                                       |
| `Find`                  | `Root`, `Input`, `Next`, `Prev`, `Toggle`, `Count`, `Result`, `Layer`                                                                         |
| `Outline`, `Thumbnails` | `Root`, `Tree`, `Item` · `Root`, `Item`                                                                                                       |
| `Annotations`           | `Root`, `Layer`, `SelectionMenu`, `Popover`, `HoverCard`, `Margin`, `LineMarkers`, `List`, `Crop`, `Comment`, `Tool`, `Color`, `Undo`, `Redo` |
| `Paper`, `Toc`          | `Root`, `Layer`, `CitationCard`, `CrossRefPreview`, `References`, `Figures` · `Tree`, `Flat`, `Breadcrumb`, `Progress`, `Rail`                |

Every part accepts `class`, `style` and other attributes (event handlers are chained), a bindable `ref`, a `child` snippet to render your own element, and `children` with snippet props. Parts are unstyled: target `data-pdf-*` attributes (the optional `styles.css` gives sensible defaults through CSS variables).

The same features are available without components through the state classes (`PdfDocument`, `ViewerState`, `PageState`, `FindState`, `OutlineState`, `AnnotationStore`, `PaperState`) and plain-TypeScript core (`svelte-pdf-mini/core`: text index, search, geometry, page themes, PDF codec, paper analysis, providers).

Targets the latest evergreen browsers. [MIT](https://github.com/julien-blanchon/svelte-pdf-mini/blob/main/LICENSE) © Julien Blanchon.
