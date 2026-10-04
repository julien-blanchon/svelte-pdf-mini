<p align="center">
  <img src="apps/docs/static/favicon.svg" width="72" height="72" alt="" />
</p>

<h1 align="center">svelte-pdf-mini</h1>

<p align="center">
  Headless, composable PDF viewer and research-paper reader components for <b>Svelte 5</b> (runes), built on <b>pdf.js</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/svelte-pdf-mini"><img src="https://img.shields.io/npm/v/svelte-pdf-mini?color=4466c4" alt="npm version" /></a>
  <a href="https://github.com/julien-blanchon/svelte-pdf-mini/actions/workflows/ci.yml"><img src="https://github.com/julien-blanchon/svelte-pdf-mini/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://julien-blanchon.github.io/svelte-pdf-mini"><img src="https://img.shields.io/badge/docs-live-6f9dff" alt="Docs" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/svelte-pdf-mini?color=4466c4" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://julien-blanchon.github.io/svelte-pdf-mini/docs">Documentation</a> ·
  <a href="https://julien-blanchon.github.io/svelte-pdf-mini/components">Components</a> ·
  <a href="https://julien-blanchon.github.io/svelte-pdf-mini/examples">Examples</a> ·
  <a href="https://julien-blanchon.github.io/svelte-pdf-mini/docs/changelog">Changelog</a>
</p>

```sh
bun add svelte-pdf-mini   # or npm i / pnpm add
```

```svelte
<script>
	import { Document, Viewer } from 'svelte-pdf-mini';
	import 'svelte-pdf-mini/styles.css';
</script>

<Document.Root src="https://arxiv.org/pdf/1706.03762">
	<Viewer.Root zoomMode="page-width" style="height: 100vh">
		<Viewer.Viewport style="height: 100%"><Viewer.Pages /></Viewer.Viewport>
	</Viewer.Root>
</Document.Root>
```

## Features

- **Viewer:** virtualised rendering, eased zoom (centred / cursor-anchored), fit modes, 1–4 pages per row or `auto`, spreads, rotation, pinch-zoom, `focus()` with highlight effects, back/forward history, minimap.
- **Text & navigation:** selectable text, text index, find (case, accents, ligatures, hyphenation), outline, thumbnails, links with hover previews.
- **Annotations:** highlights, underline / strike-out / squiggly, boxes, notes, ink, shapes, free text, adaptive side notes, gutter markers, hover cards, undo/redo, read-only and foreign policies, context menus and keyboard shortcuts.
- **PDF round trip:** standard PDF annotations with appearance streams (Apple Preview, Acrobat, browsers), lossless re-import, Markdown / JSON export.
- **Research papers:** sections, references, in-text citations with hover cards and online enrichment (OpenAlex, Semantic Scholar, Crossref), figures and tables, cross-references, five table-of-contents views.
- **Headless:** every part takes `class`, `style`, a bindable `ref` and a `child` snippet; state lives in plain runes classes and a framework-free core (`svelte-pdf-mini/core`).

## Repository

| Path | What |
|---|---|
| [`packages/svelte-pdf-mini`](packages/svelte-pdf-mini) | The library (`core/` plain TS, `state/` runes classes, `components/` compound parts) |
| [`apps/docs`](apps/docs) | Docs (mdsvex), live feature demos and integrated apps (SvelteKit + Tailwind v4); demos live in `src/lib/demos`, full screen at `/demo/<name>` |
| [`fixtures`](fixtures) | arXiv test papers (`bun run fixtures` downloads them) and evaluation scripts |

## Development

Requires [bun](https://bun.sh) 1.3+.

```sh
bun install
bun run dev            # docs + demos on http://localhost:5173
bun run check          # svelte-check everything
bun run test           # fast library unit tests (~1 s)
bun run fixtures       # download the arXiv test PDFs (needed by the unit tests)
bun run test:full      # + slow real-PDF round trips (pdf.js, pdf-lib, PDFKit on macOS)
bun run test:e2e       # @smoke end-to-end tests against the dev server (~10 s)
bun run test:e2e:full  # every end-to-end test (~30 s)
```

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets):

1. In a pull request that changes the library, run `bun changeset` and describe the change for users (patch / minor / major). CI reminds you when it's missing.
2. Once merged into `main`, the **Release** workflow opens a "version packages" pull request with the new version and changelog.
3. Merging that pull request publishes to npm (with provenance) and creates a GitHub release.

The changelog lives in [`packages/svelte-pdf-mini/CHANGELOG.md`](packages/svelte-pdf-mini/CHANGELOG.md) (written by Changesets) and is published as the [Changelog page](https://julien-blanchon.github.io/svelte-pdf-mini/docs/changelog) of the docs.

The docs are deployed to GitHub Pages by the **Docs** workflow on every push to `main`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Julien Blanchon
