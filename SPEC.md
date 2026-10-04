# svelte-pdf-mini: a Svelte 5 PDF and research-paper reader library (spec v0.2)

> Package: **`svelte-pdf-mini`** (free on npm).
> Status: spec approved with the decisions in §14; implementation started (M0).
> Inputs: `google-scholar-reader/FEATURES.md`, `paperpile/FEATURES.md`, the analysis of `leed_pdf_viewer`, the bits-ui and melt docs and source, and pdfjs-dist 6.4.299.

---

## 0. One-paragraph summary

svelte-pdf-mini is a **headless-first, compound-component** PDF library for Svelte 5 (runes), built on **pdf.js**. The UI should feel like the Google Scholar Reader, the annotations should be as capable as Paperpile's, and the code should be organised like bits-ui. It has three layers:

1. a framework-agnostic **core** in plain TypeScript (pdf.js, geometry, text index, search, annotation model and PDF codec, reading-aid analysers);
2. **runes state classes** you can use without any components;
3. **compound components** (`Viewer.Root`, `Viewer.Page`, `Annotations.Layer`, …) with `child` snippets, `ref`, `data-*` attributes and no styles.

Annotations are saved to and loaded from **standard PDF annotation objects**. Apple Preview, Acrobat, Chrome and Firefox display them, and svelte-pdf-mini rebuilds them losslessly from the same file. svelte-pdf-mini does no storage or sync; the host app persists data through change events.

---

## 1. Goals and non-goals

**Goals**
- Reusable across many projects. The main target is a **research-paper reader** in the style of Google Scholar Reader or alphaXiv.
- **Robust:** virtualised rendering, cancellation, no leaks, SSR-safe, works for 1,000-page PDFs, handles bad PDFs gracefully.
- **Customisable:** headless parts, swappable providers (citation metadata, AI outline), configurable shortcuts and colours, and every piece is optional.
- **Interoperable annotations:** what we export can be read back by other viewers and re-imported exactly by us (§9).
- **Reading aids:** outline, clickable citations with reference cards, link and figure previews, back-navigation, find, active section.

**Non-goals (for now)**
- Storage, sync, accounts and collaboration. svelte-pdf-mini emits change events and the host persists them.
- Form filling and XFA. Showing the pdf.js AnnotationLayer for forms is P2; editing forms is out of scope.
- PDF page editing (merge, reorder). pdf.js `extractPages` makes this easy later (P2).
- Shipping a styled design system. Examples use Tailwind; the library ships an *optional* `styles.css` with base layout and CSS variables only.

---

## 2. Key technical decisions

| Decision | Choice | Why |
|---|---|---|
| PDF engine | **pdfjs-dist 6.x** core APIs (`getDocument`, `render`, `TextLayer`, `AnnotationLayer` for links and forms, `getOutline`, `getDestination`, `getStructTree`) | Mature and MIT-licensed. We **do not** use `PDFViewer` or `PDFPageView` from `web/pdf_viewer.mjs`: they are hard to customise and Scholar also skipped them. |
| pdf.js editor (`AnnotationEditorUIManager`) | **Not used** | Internal API whose 16-argument constructor changes between releases. It writes no `/NM`, `/IRT` or `/RC` and has no underline or strike-out. We build our own editors. |
| Annotation writer | **@cantoo/pdf-lib** (MIT, maintained fork, supports incremental save) | Low-level `PDFDict` gives us full control over `/AP`, `/QuadPoints` and private keys. `pdf-lib` itself has been unmaintained since 2022; mupdf is AGPL. |
| Annotation reader | pdf.js `getAnnotations()` for display data, plus @cantoo/pdf-lib for raw dicts (private keys, embedded JSON) | pdf.js drops quads that fall outside `/Rect` and doesn't expose private keys, so for our own data we read the dict directly. |
| Svelte | **≥ 5.33** (attachments, `$props.id()`, `createAttachmentKey`) | Same baseline as bits-ui 2.x. |
| Helpers | `runed` (Context, watch, useDebounce), `svelte-toolbelt` (boxWith, mergeProps, attachRef), `@floating-ui/dom` (popovers) | The same small toolkit bits-ui uses. Floating-ui is only loaded by components that need it. |
| Browser support | **Latest evergreen browsers only.** Modern pdf.js build, latest Svelte, SvelteKit and Vite. No legacy build, no polyfills | Decided (§14). We can freely use recent platform APIs (`Promise.withResolvers`, `Uint8Array.fromBase64`, `scrollend`, View Transitions, `OffscreenCanvas`). |
| Tooling | **bun** workspaces, `svelte-package` plus `publint`, Vitest (unit and browser mode), Playwright for end-to-end and visual tests | — |
| Examples | SvelteKit and **Tailwind v4**, papers loaded straight from arXiv | arXiv PDFs send `Access-Control-Allow-Origin: *` and `Accept-Ranges: bytes` (checked), so streaming and range loading work without a proxy. |
| Licence | MIT | Rules out mupdf. |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Components   svelte-pdf-mini            (headless compound components)       │
│   Document.Root  Viewer.{Root,Viewport,Pages,Page,Canvas,TextLayer,…}     │
│   Annotations.{Layer,Toolbar,SelectionMenu,List,Thread,…}  Find.*  …      │
│   ─ child snippet / children(snippetProps) / ref / data-pdf-* attrs     │
├──────────────────────────────────────────────────────────────────────────┤
│ State (runes)   svelte-pdf-mini/state   (usable without components)          │
│   PdfDocument  ViewerState  PageState  SelectionState  AnnotationStore    │
│   History(undo) FindState  OutlineState  LinkState  CitationState  …      │
│   ─ $state.raw for pdf.js objects, Synced-style controlled/uncontrolled   │
│   ─ prop-getters returning {…attrs, [attachmentKey]: fn} (melt-style)     │
├──────────────────────────────────────────────────────────────────────────┤
│ Core (plain TS, no Svelte)   svelte-pdf-mini/core                            │
│   loader · render-scheduler · geometry · text-index · search · selection  │
│   annotation model · pdf-codec (read/write/AP gen) · anchoring            │
│   aids: links/dests · outline-heuristics · references parser · figures   │
│   providers: CitationProvider (S2/OpenAlex/Crossref) · OutlineProvider    │
└──────────────────────────────────────────────────────────────────────────┘
         pdfjs-dist (worker)                 @cantoo/pdf-lib (lazy-loaded on export/import)
```

**Package shape:** one npm package with subpath exports:
- `svelte-pdf-mini` (components, plus re-exports)
- `svelte-pdf-mini/state`
- `svelte-pdf-mini/core`
- `svelte-pdf-mini/providers/*`
- `svelte-pdf-mini/styles.css`

`core` has zero Svelte imports, so it could be split into its own package later if a React or vanilla consumer appears (not planned). pdf-lib and the providers are **lazy-imported** so a minimal viewer stays small.

**Repository (bun workspaces):**
```
svelte-pdf-mini/
  package.json            # "workspaces": ["packages/*", "apps/*"]
  packages/svelte-pdf-mini/  # the library (SvelteKit lib mode, svelte-package)
    src/lib/core/…  src/lib/state/…  src/lib/components/<namespace>/…
  apps/docs/              # SvelteKit + Tailwind v4: docs (mdsvex), demos, apps (§12)
  fixtures/               # arXiv ids list + script `bun run fixtures` (cache to disk for tests)
```

### 3.1 Coordinate system (the most important invariant)

- **Stored geometry is always in PDF user space, unrotated, per page** (origin bottom-left, units of 1/72 in, relative to the page's `/CropBox`). This is what PDF annotations use, so export is a direct mapping. leed stores unrotated coordinates at scale 1 for the same reason.
- `core/geometry` provides `pdfToViewport(rect, viewport)` and `viewportToPdf(…)` for rects, quads and points (it wraps `viewport.convertToViewportPoint`). It also handles rotation and CropBox offsets and includes a separating-axis test (from Scholar).
- Scholar instead stores rects relative to a per-page "anchor" (the first body-text item), so they survive different versions of the same paper. We get the same robustness from **text-quote anchoring** (§8.6) and keep the geometry absolute.

### 3.2 Rendering pipeline
- **Virtualisation.** An `IntersectionObserver` on page shells sized from `getViewport` reports which pages are visible. Pages within ±N of the visible ones are rendered and the rest are released (`page.cleanup()`). Page shells always have the correct size, so the scroll height is exact.
- **RenderScheduler** (in core): a priority queue (visible pages first, then nearby pages, then thumbnails), a concurrency of 1–2, and `RenderTask.cancel()` when a page leaves the view or the zoom changes. This avoids leed's single-flight `isRendering` flag and the "canvas in use" errors it causes.
- **HiDPI.** Render at `zoom × devicePixelRatio`, capped at a maximum canvas area (pdf.js `maxCanvasPixels`, about 16 MP). At very high zoom, render a lower-resolution full page plus a high-resolution tile of the visible region (P2).
- **Zoom gestures** (leed's trick). During a pinch or Ctrl+wheel only a CSS `transform: scale()` on the pages container changes. The real zoom is committed after the gesture ends (about 80 ms debounce), the scroll position is kept anchored under the cursor, and pages are re-rendered.
- **Layers per page**, all optional components:
  - `Canvas`
  - `TextLayer` (pdf.js `TextLayer`)
  - `LinkLayer` (native links; our own lightweight version, or pdf.js `AnnotationLayer` with `annotationMode` set to `ENABLE`)
  - `AnnotationLayer` (our SVG/HTML annotations)
  - `FindLayer`
  - `AidsLayer` (citation and figure hotspots)
  - `Overlay` (free slot for app content)

  Native annotations in the PDF are rendered by **us** (canvas `annotationMode` set to `DISABLE`) when they are types we can edit. Otherwise pdf.js draws them on the canvas (`ENABLE`) and we only show them read-only. This is configurable.

---

## 4. Feature catalogue (what and how)

Priority: **P0** is the MVP, **P1** completes the "Scholar-class reader", **P2** comes later. Source shows where the idea comes from: **S** = Scholar, **P** = Paperpile, **L** = leed, **N** = new.

### 4.1 Loading

| # | Feature | P | How | Src |
|---|---|---|---|---|
| L1 | `src` = URL, `ArrayBuffer` / `Uint8Array`, `File` / `Blob`, or an already-loaded `PDFDocumentProxy` | P0 | `core/loader` normalises the source. URLs use pdf.js range and stream loading (`rangeChunkSize`, `disableAutoFetch` configurable) | S,L |
| L2 | Progress, error and `status` (`idle / loading / password / ready / error`) | P0 | `loadingTask.onProgress`; typed errors (`InvalidPDF`, `Missing`, `Network`, `Password`) | S |
| L3 | Password prompt | P0 | `onPassword` becomes `status = "password"` plus a `submitPassword(pw)` method; a headless `Document.Password` part | S,P |
| L4 | Custom fetch: `httpHeaders`, `withCredentials`, or a user `fetch`/`PDFDataRangeTransport` adapter | P1 | Lets hosts proxy PDFs, add auth, or stream from IndexedDB | S |
| L5 | Swapping `src` cancels and destroys the old task cleanly | P0 | Attachment or `watch` cleanup calls `loadingTask.destroy()` | N |
| L6 | Worker config: one shared worker by default, overridable (`workerSrc`/`workerPort`, cMap, standard fonts, wasm and ICC URLs) | P0 | `configurePdf({...})` once; the Vite `?url` recipe goes in the docs. SSR-safe through a dynamic `import()` behind `BROWSER` | N |
| L7 | Drag-and-drop or file-input helper | P1 | `Document.Dropzone` part (headless) | L |
| L8 | Document identity: `fingerprints[0]` plus an optional text hash | P1 | Gives hosts a stable key to store annotations under. Scholar's idea: a byte hash plus a hash of normalised text across versions | S |
| L9 | Document properties (title, authors, dates, producer, page size and name, linearised) | P1 | `getMetadata()` plus a paper-size table | S |

### 4.2 Viewing and layout

| # | Feature | P | How | Src |
|---|---|---|---|---|
| V1 | Continuous vertical scroll with virtualised pages | P0 | §3.2 | S,P |
| V2 | Scroll modes: vertical, horizontal, wrapped (grid), single page (paged) | P1 | `ViewerState.scrollMode`; layout computed from page sizes | P,L |
| V3 | Spreads: none, odd, even | P2 | layout | N |
| V4 | Zoom: numeric, steps (25–500%), `page-width`, `page-fit`, `page-height`, `auto`, and **`text`** (body text at about 17 px, Scholar's median-font-size heuristic) | P0 / `text` P1 | `ViewerState.zoom` (bindable) plus `zoomMode` | S,L |
| V5 | Ctrl/⌘+wheel and pinch zoom anchored under the cursor, with inertia-free commit | P0 | §3.2; wheel delta normalised across `deltaMode` | L,S |
| V6 | Rotation, whole document and per page | P1 | Viewport rotation; annotations stay unrotated in storage | S,L |
| V7 | Thumbnails (lazy, low priority in the scheduler) | P1 | `Thumbnails.Root/Item`; reuses the scheduler at about 150 px | S,P,L |
| V8 | Page labels (roman numerals for front matter) | P1 | `getPageLabels()` | N |
| V9 | Hand / pan tool and middle-click pan | P1 | Pointer handler on the viewport | S |
| V10 | Touch: pinch, two-finger pan, pen ignored for pan | P1 | Port leed's gesture logic (pointer-id locking, per-frame intent check) | L |
| V11 | Fullscreen / presentation mode | P2 | `Viewer.requestPresentation()` | L |
| V12 | Print | P1 | Print the original bytes or the export with annotations through a hidden iframe and blob URL | S,P |
| V13 | Download: original, with annotations (§9), or flattened | P1 | `exportPdf({mode})` | P |

### 4.3 Navigation and "focus to a given place"

`ViewerState` exposes one consistent API. Every target can be a page, destination, rect, annotation, text quote or outline item. Each method returns a promise that resolves once the target has been scrolled into view and rendered.

| # | Feature | P | How |
|---|---|---|---|
| N1 | `goToPage(n, {align:'start'\|'center', behavior, offset})`; bindable `page` (current page, tracked by the visible-area ratio) | P0 | Page shells have exact offsets, so it's pure math plus `scrollTo` |
| N2 | `goToDestination(dest)` for named or explicit dests (`XYZ`, `Fit`, `FitH`, `FitR`, …) | P0 | `getDestination` → `getPageIndex(ref)` → `convertToViewportPoint` |
| N3 | **`focus(target, {highlight:'pulse'\|'outline'\|false, zoom?})`**, where target is `{page, rect}` / `{annotationId}` / `{quote, prefix?, suffix?}` / `{dest}` / `{outlineItem}` | P0 | Centres the target and briefly flashes a CSS-animated box (`data-pdf-focus`). For quotes it uses the text index (§4.4); this is Paperpile's `?hl=` idea, done entirely on the client |
| N4 | Navigation history (back and forward after following a link or citation) plus a floating **"Back to where you were"** button | P1 | Our own stack of `{page, scroll fraction}` entries; optional sync with `history.pushState` | S |
| N5 | Fractional position in the URL (`#page=3.42&zoom=…`) restored on load | P1 | `Viewer.Location` helper with `toHash()/fromHash()`; the host decides whether to use it | S |
| N6 | Keyboard: ←/→/PgUp/PgDn/Home/End/Space, `g`-style go-to-page | P0 | Configurable shortcut map (§4.10) | S,P,L |

### 4.4 Text, selection and copy

| # | Feature | P | How | Src |
|---|---|---|---|---|
| T1 | Selectable text layer | P0 | pdf.js `TextLayer` (it already does the per-span `scaleX` fitting Scholar wrote by hand) | S |
| T2 | **Text index** (core): per-page normalised text (NFKD, ligatures, smart quotes, de-hyphenated line ends) with an offset map back to `(itemIndex, charOffset)` and from there to rects | P0 | Built lazily from `getTextContent`. It's the basis for find, quote anchoring, citation detection and copy | S |
| T3 | Selection model: converts the DOM selection to `TextRange { page, start, end, text, quads }`, multi-page aware | P0 | Partial span widths come from char offsets × the span's measured width ratio (Scholar `selectionToPageBounds`), or `Range.getClientRects()` clipped to spans and then converted to PDF space | S,P |
| T4 | Better selection: double-click selects a word, triple-click a **visual line**, and dragging across gaps snaps to the nearest span | P1 | `caretRangeFromPoint` (Scholar F20) | S |
| T5 | Copy cleanup: join lines, remove hyphenation, optional "copy as quote with citation" hook | P1 | `oncopy` handler using the text index | S |
| T6 | Tight highlight boxes: optionally trim quad height to the glyph ink | P2 | Paperpile trims against the canvas pixels; do this cheaply using font ascent and descent | P |

### 4.5 Find

| # | Feature | P | How |
|---|---|---|---|
| F1 | Find across the document, with case, diacritics, whole-word and regex options | P0 | Our own engine over the text index (pdf.js `PDFFindController` needs the full viewer). The query is compiled to a Unicode regex that ignores combining marks and collapses whitespace (Scholar F22). Runs incrementally page by page and yields to the main thread |
| F2 | Results list with context snippets, plus `next/prev/current` and a `total` count | P0 | `FindState` with `matches: {page, quads, snippet}[]` |
| F3 | Match highlighting (all matches and the current one), with the current match scrolled into view | P0 | `Find.Layer` per page, using `data-current` |
| F4 | Search inside annotation comments | P1 | Same engine run over the annotation store |

### 4.6 Theming and dark mode

| # | Feature | P | How |
|---|---|---|---|
| D1 | Headless styling through `data-pdf-<part>` attributes, `data-state`, and CSS variables (`--pdf-page-gap`, `--pdf-page-shadow`, `--pdf-hl-<color>`, …) | P0 | bits-ui convention |
| D2 | **Pluggable page dark-mode strategies** through `pageTheme={{ strategy, …options }}`. Each has its own cost and quality trade-off, and the host picks one per app or lets the user choose | P0 (`invert`, `dim`, `recolor`), P1 (`smart-invert`, `vector-recolor`) | See the strategy table below |
| D3 | Strategy API: `PageThemeStrategy { id; needsRerender: boolean; renderParams?(page) ; canvasClass?/style ; postProcess?(ctx, page) }` so apps can add their own | P1 | Built-in strategies are registered the same way as custom ones |

**Dark-mode strategies**

| Strategy | What it does | Quality and cost |
|---|---|---|
| `none` | Original rendering | — |
| `invert` | CSS `filter: invert(1) hue-rotate(180deg)` on the canvas, with tunable `brightness`/`contrast`/`saturate` (Scholar: `saturate(2) brightness(1.1)`) | Instant, no re-render. Photos and figures get inverted |
| `smart-invert` | `invert`, plus un-inverted crops of raster images drawn back on top. Image boxes come from the operator list (`paintImageXObject` and the current transform); for vector figures we use the figure boxes from §8.4 | Good figures; costs one operator-list pass per page (cached) |
| `dim` | Keeps the page colours but lowers brightness and warms them (`brightness(.8) sepia(.2)`), or applies a sepia "paper" tint | Instant. For readers who dislike inverted pages |
| `recolor` | pdf.js `pageColors: {background, foreground}`: everything is mapped to a duotone from fg to bg | Needs a re-render. Text is perfect; images become duotone |
| `vector-recolor` | Wraps the 2D canvas context passed to `page.render` so that `fillStyle` and `strokeStyle` colours are remapped (luminance inverted, hue kept), while `drawImage` and `putImageData` pass through untouched | Needs a re-render. Best quality (coloured plots stay coloured and photos stay intact), but experimental: gradients, patterns and blend modes need fallbacks |
| custom | User strategy object | — |

The UI chrome theme (`theme: light|dark|system`) is separate from the page strategy. Annotations always use their own palette per theme (D4).
| D4 | Annotation colours stay meaningful in dark mode | P0 | Annotations live in our own SVG and HTML layer, *not* the canvas, so their colours come from CSS variables with separate light and dark palettes (Paperpile `getNightColor`, Scholar's dark palette) |
| D5 | `theme: 'light' \| 'dark' \| 'system'` | P0 | `data-pdf-theme` on Root; system follows `prefers-color-scheme` |

### 4.7 Panels (all headless, all optional)

| # | Feature | P | How |
|---|---|---|---|
| PN1 | **Outline** tree, with the **active section** tracked while scrolling | P0 | `getOutline()`. Destinations are resolved to `{page, y}`, and the active item is the last one whose `y` is above the viewport top (an interval search, as in Scholar). Falls back to the heuristic outline (§8.2) |
| PN2 | Thumbnails | P1 | V7 |
| PN3 | Annotation list: sorted by page and position, filterable by type, colour or author, with a small crop thumbnail of each annotation (Paperpile) | P1 | `Annotations.List/Item`. The crop is rendered from the page canvas, or by a low-resolution clipped render |
| PN4 | **Comment column** beside the pages, with bubbles aligned to their annotation and laid out to avoid overlaps (Scholar) | P1 | `Annotations.Margin`: a 1-D layout that sorts by y and pushes bubbles down |
| PN5 | Figures and tables index | P1 | §8.4 |
| PN6 | References list (parsed bibliography) | P1 | §8.3 |
| PN7 | Properties dialog | P2 | L9 |

### 4.8 Annotations (UI and model)

See §6 for the model and §9 for the PDF mapping.

| # | Feature | P | How | Src |
|---|---|---|---|---|
| A1 | **Text markup**: highlight, underline, strike-out, squiggly | P0 | Select text, then the floating **SelectionMenu** (colour, type, comment). Optional "sticky tool" mode where every selection creates a markup immediately (Paperpile) | S,P |
| A2 | **Comment / note** on any annotation, plus stand-alone sticky notes | P0 | `contents` (plain text) and optional Markdown rendering in the UI. Exported as `/Contents` plain text plus `/RC` XHTML | S,P |
| A3 | Threaded replies | P1 | Separate annotations with `inReplyTo` (PDF `/IRT`, `/RT /R`) | P |
| A4 | Ink (freehand), with smoothing and optional pressure width | P1 | Pointer events captured on an SVG overlay. Points are stored in PDF space; smoothing (Catmull-Rom or quadratic) runs **once** in core and is reused for both display and `/AP` (leed duplicated it) | P,L |
| A5 | Shapes: rectangle, ellipse, line, arrow | P1 | SVG plus resize and move handles | P,L |
| A6 | Free text (typed text box) | P1 | `contenteditable`, with font, size and colour | P,L |
| A7 | Area highlight (rectangular region, e.g. a figure), useful for "clip this figure" | P1 | A `Square` with a fill and Multiply blend, flagged `kind:'area'` | N |
| A8 | Polygon, polyline, stamps and images | P2 | — | P,L |
| A9 | Select, move, resize, recolour, change type, opacity, delete; multi-select; keyboard nudging | P1 | `SelectionState` for annotations; handles in `Annotations.Handles` | P |
| A10 | Undo and redo for **all** operations | P0 | `History` built on command objects (`add/update/remove` with the previous value). Only local changes are recorded (Paperpile). leed's undo only covered ink | P,L |
| A11 | Copy and paste annotations (also across pages) | P2 | — | P |
| A12 | Colour palette: 5–8 named colours (configurable), plus custom colours | P0 | Stored as RGB 0..1 plus an optional `paletteKey` so theme remapping works | S,P |
| A13 | **Editable and read-only modes**: a global `readonly` prop, a per-annotation `locked` flag, and a `foreignAnnotations` policy for annotations already in the PDF: `'editable'` (imported into the store, Preview-like), `'readonly'` (imported and shown but locked), `'native'` (left to pdf.js on the canvas) or `'hidden'` | P0 | Each policy is a prop on `Annotations.Root`, and the per-annotation `locked` flag overrides it | P |
| A14 | Author (name, optional id and colour) and timestamps | P0 | `author` prop on Root, written as `/T`, `/M`, `/CreationDate` | P |
| A15 | Hover and selection states, focusable annotations (Tab), ARIA labels | P1 | `role="button"`, `aria-describedby` pointing at the comment | S |
| A16 | Max lengths and validation (Scholar: 3,000-character quote, 2,000-character comment) | P1 | Configurable | S |
| A17 | **Controlled or uncontrolled store**: `bind:annotations` or `annotations={…} onAnnotationsChange` | P0 | The host persists (localStorage, DB, …). This is where storage and sync are handed off to the host | — |
| A18 | Annotation search and filtering | P1 | F4 | P |

### 4.9 Reading aids

See §8 for detail.

| # | Feature | P |
|---|---|---|
| R1 | Native internal links clickable, external links open in a new tab with a safety check | P0 |
| R2 | **Link and destination hover preview**: a popover with a clipped render of the target region (equation, figure, section start, reference) | P1 |
| R3 | **Citation cards**: hover or click on `[12]` / "(Smith et al., 2020)" shows the parsed reference, enriched by a provider (title, authors, venue, year, abstract, citation count, links to arXiv, DOI and PDF), with a pager for citation groups like `[3–7]` | P1 |
| R4 | Back-navigation after any jump (N4) | P1 |
| R5 | Outline: native first, heuristic fallback; active section | P0 / heuristic P1 |
| R6 | Figures and tables index plus "Fig. 3" / "Table 2" / "Section 4.1" / "Eq. (5)" text links even when the PDF has none | P1 |
| R7 | References panel (the parsed bibliography), each entry linking to the in-text citations that use it ("cited 3× in this paper") | P1 |
| R8 | Paper metadata header: arXiv id detection (URL or first-page text), title, authors, version, links to abs and HTML | P1 |
| R9 | AI outline and summary **hook**: an `OutlineProvider` interface that returns Markdown or JSON bullets anchored to quotes, which we resolve to locations with the text index (Scholar's "key points" approach). We don't ship an LLM | P2 |
| R10 | Glossary and acronym hover ("first defined here") | P2 |

### 4.10 Cross-cutting

| # | Feature | P | How |
|---|---|---|---|
| X1 | Keyboard shortcut map, configurable or disable-able, scoped to the viewer's focus | P0 | `shortcuts` prop that merges with the defaults; ignored while focus is in an input or contenteditable (leed). Defaults are taken from Scholar F40 and Paperpile |
| X2 | i18n: every string comes from a `messages` prop (English defaults), plus RTL | P1 | — |
| X3 | Accessibility: page `role="region"` with labels, text layer reachable by screen readers, focus management in popovers, `prefers-reduced-motion` respected for scroll and pulse | P1 | pdf.js `StructTreeLayerBuilder` equivalent is P2 |
| X4 | Events for analytics hooks (`onPageView`, `onLinkClick`, …), with **no** built-in telemetry | P1 | — |
| X5 | Robustness: every async op is cancellable, `destroy()` everywhere, error boundaries per page (one broken page doesn't kill the document), worker crash recovery | P0 | — |
| X6 | Performance budget: initial bundle without pdf-lib or providers; first page shown under 1 s for a 1 MB arXiv PDF over the network (streamed) | P0 | — |

---

## 5. Component and state API (draft)

### 5.1 Namespaces and parts

```
Document     .Root (loads src, provides PdfDocument)  .Password  .Error  .Loading  .Dropzone
Viewer       .Root (ViewerState: zoom, page, scrollMode, rotation, theme, pageColors)
             .Viewport (scroll container; gestures)  .Pages (virtualised list; children snippet per page)
             .Page (snippet props: {pageNumber, width, height, isVisible, isRendered, scale})
             .Canvas  .TextLayer  .LinkLayer  .Overlay  .Focus (flash box)  .BackButton
Zoom         .Root  .In  .Out  .Reset  .Select (mode/value)          — headless controls
PageNav      .Root  .Prev  .Next  .Input  .Label ("3 / 12", page labels)
Find         .Root  .Input  .Prev  .Next  .Count  .Options  .Results  .Result  .Layer
Outline      .Root  .Tree  .Item (snippet: {item, depth, isActive, isExpanded})  .Trigger
Thumbnails   .Root  .Item
Annotations  .Root (AnnotationStore + History)  .Layer (per page)  .Item
             .SelectionMenu (floating, from text selection)  .Toolbar  .Tool  .ColorPicker
             .Handles  .Margin (comment column)  .Thread  .Comment  .Reply  .List  .ListItem
Aids         .Root (runs analysers, providers)  .Layer (per page hotspots)
             .CitationCard  .LinkPreview  .References  .Figures  .ActiveSection
Export       helpers (not components): exportPdf(), importAnnotations(), toJSON()/fromJSON()
```

### 5.2 Conventions (from bits-ui and melt, adapted)

- **Every part** accepts `ref` (bindable), `child` snippet (`{props, ...snippetProps}`), `children` snippet (`snippetProps`) and rest HTML attributes merged with `mergeProps`. Each renders a sensible default element.
- **State props** are bindable and paired with an `onXChange` callback. Function bindings work for veto or transform: `bind:page={() => p, (v) => …}`. Bindable state: `page`, `zoom`, `zoomMode`, `rotation`, `scrollMode`, `theme`, `annotations`, `activeTool`, `activeColor`, `selectedAnnotationIds`, `findQuery`.
- **Styling hooks:** `data-pdf-<part>`, `data-state`, `data-current`, `data-active`, `data-tool`, `data-color`, `data-kind`, plus CSS variables. No classes are imposed; the optional `styles.css` only sets structural layout (positioning layers, page gaps).
- **Floating parts** (SelectionMenu, CitationCard, LinkPreview) use floating-ui, `forceMount` plus `child({props, open})` for transitions, and expose `--pdf-anchor-width`-style variables.
- **State classes** follow the `XState.create(opts)` pattern, which registers a `runed` Context. Pages and layers fetch their parent with `XContext.get()` synchronously during init.
- pdf.js proxies are always `$state.raw`. Heavy per-page data (text index, analysis) is cached in core maps keyed by page, not in reactive state.
- **Builder use without components** (melt style):

```ts
const doc = new PdfDocument({ src: () => url });
const viewer = new ViewerState({ document: doc, zoomMode: 'page-width' });
// <div {...viewer.viewport}> {#each viewer.visiblePages as p} <canvas {...viewer.getCanvas(p)} /> …
```

### 5.3 Example composition (target developer experience)

```svelte
<Document.Root src="https://arxiv.org/pdf/1706.03762">
  <Viewer.Root bind:page bind:zoom theme="system">
    <Toolbar />  <!-- app-made, using Zoom.*, PageNav.*, Find.* -->
    <Annotations.Root bind:annotations author={{ name: 'Julien' }}>
      <Aids.Root citationProvider={semanticScholar()}>
        <Viewer.Viewport class="h-dvh overflow-auto bg-neutral-100 dark:bg-neutral-900">
          <Viewer.Pages>
            {#snippet children({ pageNumber })}
              <Viewer.Page {pageNumber} class="mx-auto my-4 shadow">
                <Viewer.Canvas />
                <Viewer.TextLayer />
                <Viewer.LinkLayer />
                <Annotations.Layer />
                <Aids.Layer />
                <Find.Layer />
              </Viewer.Page>
            {/snippet}
          </Viewer.Pages>
        </Viewer.Viewport>
        <Annotations.SelectionMenu>{#snippet child({ props, open })}…{/snippet}</Annotations.SelectionMenu>
        <Aids.CitationCard />
      </Aids.Root>
    </Annotations.Root>
  </Viewer.Root>
</Document.Root>
```

---

## 6. Annotation model (in-memory, JSON-serialisable)

```ts
type Rgb = [number, number, number];          // 0..1
type Quad = [number,number, number,number, number,number, number,number]; // PDF space, Z-order TL,TR,BL,BR
interface AnnotationBase {
  id: string;                 // uuid v7 → PDF /NM
  page: number;               // 0-based
  kind: 'highlight'|'underline'|'strikeout'|'squiggly'|'note'|'ink'|'freetext'
      | 'rect'|'ellipse'|'line'|'arrow'|'area'|'polygon'|'polyline'|'stamp';
  rect: [number,number,number,number];        // PDF space bbox, always contains all geometry
  color: Rgb; opacity: number;                // /C, /CA
  paletteKey?: string;                        // 'yellow' … for theme remap
  contents?: string;                          // plain text comment → /Contents
  contentsFormat?: 'plain'|'markdown';        // UI rendering only; /RC generated from it
  author?: { name: string; id?: string };     // /T
  createdAt: string; modifiedAt: string;      // ISO → /CreationDate, /M
  inReplyTo?: string;                         // /IRT (by our id → resolved to ref on write)
  locked?: boolean; hidden?: boolean;         // /F flags (Locked=128, Hidden=2)
  origin?: 'local'|'foreign';                 // foreign = imported from someone else's PDF
  extra?: Record<string, unknown>;            // host data, round-tripped losslessly
}
interface TextMarkup extends AnnotationBase { quads: Quad[]; quote: TextQuote; }
interface TextQuote { exact: string; prefix?: string; suffix?: string; start?: number; end?: number } // W3C TextQuoteSelector + position
interface Ink extends AnnotationBase { paths: { points: [number,number][]; pressure?: number[] }[]; width: number; smoothing?: number }
interface FreeText extends AnnotationBase { text: string; font: { family: 'Helvetica'|'Times'|'Courier'; size: number; bold?: boolean; italic?: boolean } }
interface Shape extends AnnotationBase { width: number; fill?: Rgb; points?: [number,number][]; lineEndings?: [LineEnding, LineEnding] }
```

**Operations:** the store exposes `add`, `update(id, patch)`, `remove`, `batch(fn)` and emits `onAnnotationsChange(annotations, ops)`. `ops` is `{type:'add'|'update'|'remove', id, before?, after?}[]`, so hosts can persist diffs, and the same objects feed the undo history.

---

## 7. Default keyboard shortcuts (all configurable)

| Keys | Action |
|---|---|
| ⌘/Ctrl `+` `=` `-` `0` · Ctrl+wheel | Zoom in, zoom in, zoom out, reset; zoom under the cursor |
| ← → PgUp PgDn Home End Space | Page navigation |
| ⌘/Ctrl F · Enter / ⇧Enter · ⌘/Ctrl G | Find, then next or previous match |
| ⌘/Ctrl `[` `]` | Rotate |
| Alt+← / Alt+→ | Navigation history back and forward (after jumps) |
| H / U / S / N / I / T / R | Tools: highlight, underline, strike-out, note, ink, text, rect (Paperpile-style) |
| 1–5 | Colour of the selected annotation or tool |
| Enter (with text selected) | Open the SelectionMenu (Scholar) |
| ⌘/Ctrl Z / ⇧⌘Z | Undo / redo |
| Delete / Backspace | Delete the selected annotation |
| Esc | Close popover, deselect, return to the select tool |

---

## 8. Reading aids: how they work

> **Research-paper module** (`svelte-pdf-mini/paper`, plus the `Aids.*` / `Paper.*` components). It works **offline, from the PDF alone**; network providers only *enrich* it. One analysis pass per document (in a Web Worker, cached by fingerprint) produces a `PaperModel`:
> `{ meta {title, authors, arxivId?, doi?}, sections: Section[] (tree), references: Reference[], citations: InTextCitation[] (each with quads plus referenceIds), figures: Figure[], equations?, links }`
>
> **Table of contents, displayed several ways** (all headless parts reading `PaperModel.sections`):
> `Toc.Tree` (collapsible, Scholar style), `Toc.Flat` (numbered list), `Toc.Breadcrumb` (current section path in the toolbar), `Toc.Progress` (sticky mini-map of sections with a reading-progress bar), `Toc.Rail` (dots in the margin aligned with section starts), and an active-section signal for all of them.
>
> **Citations:** every `[1]`, `[2, 5–7]`, `(Smith et al., 2020)` becomes a link (`Citation.Link` hotspot over the quads). **Hover** shows a card with the full reference text parsed from the bibliography at the end of the paper, plus enrichment when a provider is configured. **Click** jumps to the reference, with Back. Each reference in the `References` panel lists "cited N× here" and jumps between those places. The same pattern covers "Fig. 3", "Table 2", "Eq. (4)" and "Section 3.1" links with previews.


### 8.1 Link layer and previews
- Read `getAnnotations({intent:'display'})` and keep the `Link` entries: `url` (external) or `dest` (a named string or an explicit array). Each becomes an absolutely positioned `<a>` (Scholar `gsr-annotation-link`).
- **Classify** named destinations by hyperref prefix:
  - `cite.*` (biblatex uses `cite.0@key`) is a citation;
  - `figure.*` / `figure.caption.*` / `table.*` are figures or tables;
  - `section.*` / `subsection.*` are sections;
  - `equation.*` are equations;
  - `Hfootnote.*` are footnotes;
  - `Item.*`, `page.*` and `algorithm.*` are other targets.
- **Preview:** resolve the destination to `{page, x, y}` and render a clipped viewport of the target page (a small canvas at about 1.5× scale, a region of roughly 600×250 pt starting at `y`), cached per destination. For citations the preview shows the bibliography entry. For figures, the region is expanded to the detected figure box (§8.4).

### 8.2 Outline
1. `getOutline()`, with destinations resolved to `{page, y}`. Most arXiv PDFs have hyperref bookmarks.
2. Fallback heuristic: lines from the text index whose font size or weight is above the body median and that match `^\d+(\.\d+)*\s+\p{Lu}` or known headings (Abstract, Introduction, Related Work, Conclusion, References, Appendix). Hierarchy comes from the number depth.
3. Tagged PDFs: `getStructTree()` H1–H6 when available.

### 8.3 Citations and references
1. **Find the bibliography:** the `cite.*` destinations point straight at each entry (best case). Otherwise look for the "References" / "Bibliography" heading and split entries by `[n]` prefix or hanging indent (x-offset clustering).
2. **Parse entries** with a lightweight parser in core: authors, year, title (the quoted or longest capitalised segment), venue, DOI and arXiv id by regex. Extensible, so a host can plug in GROBID or anything else.
3. **In-text citations:** first, link annotations whose destination starts with `cite.` (exact). Fallback: regexes on the text index for `[12]`, `[3, 5–7]` (ranges expanded) and `(Author et al., 2020)` / `Author et al. (2020)`, matched to entries by number or by surname and year. These become hotspots in `Aids.Layer` (Scholar `InTextCitationGroup`).
4. **Enrichment** through a `CitationProvider` interface: `resolve(entry) → {title, authors, year, venue, abstract?, citationCount?, urls{pdf, doi, arxiv, s2}}`. Implementations:
   - **Default: `defaultCitationProvider()`**, which chains providers: look the reference up by DOI or arXiv id in **OpenAlex** (no key, generous limits, CORS); fall back to an **OpenAlex** title search; then, if a Semantic Scholar key is configured, add the S2 TLDR, abstract and citation count. Results from several providers are merged field by field;
   - `semanticScholar({apiKey?})`: CORS is fine; rate-limited to about 1 req/s without a key, so queue and cache;
   - `openAlex()`;
   - `crossref()`;
   - `arxiv()`: the arXiv API has no CORS, so this one needs a host proxy URL.

   Results are cached in memory by default, with an optional host cache adapter.
5. A **CitationCard** shows the entry plus enrichment, Prev/Next for groups, and actions passed in by the host (Save, Open, Copy BibTeX, Cite). These are host actions, not built in.

### 8.4 Figures and tables
- Anchors come from `figure.*` / `table.*` destinations when present.
- Captions are text-index lines matching `^(Figure|Fig\.|Table|Algorithm)\s*\d+[:.]`.
- Figure boxes: union of the image boxes from the operator list (`paintImageXObject` plus the CTM) and vector-graphics regions above or below the caption. Fall back to the region between the caption and the previous text block.
- Output: `Figure {id, label, caption, page, rect}`. This feeds the Figures panel, "Fig. 3" text links (R6), previews, and the dark-mode figure overlay (D3).

### 8.5 Active section and reading position
An interval search over outline item positions as the scroll position changes, exposed as `Aids.ActiveSection` (snippet props `{item, path}`).

### 8.6 Quote anchoring (shared by annotations, AI outline and `focus({quote})`)
Exact search in the text index, then search with prefix and suffix context, then a fuzzy match (bitap or diff-match-patch style, as Hypothesis does). Results come with a confidence score. Annotations whose quads no longer match the quote (a different version of the PDF) are re-anchored and flagged `data-reanchored`.

---

## 9. PDF export and import (round-trip contract)

**Contract.**
1. `import(export(pdf, A))` gives back `A` for every svelte-pdf-mini annotation (deep equality on the model, except `rect` normalisation).
2. The exported file shows correctly in **Apple Preview, Acrobat, Chrome (PDFium), Firefox (pdf.js), Skim and Zotero**.
3. Foreign annotations already in the input PDF are preserved, and imported into the model when that option is on.

### 9.1 Writer (`core/pdf-codec/write.ts`, lazy-loads @cantoo/pdf-lib)
- **Mode:** an incremental update by default, which keeps the original bytes and signatures and is fast. A full rewrite (`compact`) is an option.
- **Annotations we already wrote** (same `/NM`) are replaced in place. Removed ones are deleted from `/Annots`.
- **Kind to PDF subtype:**

  | kind | `/Subtype` | Geometry | `/AP /N` |
  |---|---|---|---|
  | highlight | Highlight | `/QuadPoints` | quads filled, `/BM /Multiply`, `/CA` |
  | underline / strikeout / squiggly | Underline / StrikeOut / Squiggly | `/QuadPoints` | line at the baseline, the middle, or a zig-zag |
  | note | Text (`/Name /Comment`, `/Open false`) | `/Rect` about 20×20 | icon AP (also included so Preview matches) |
  | ink | Ink | `/InkList`, `/BS /W` | smoothed Bézier paths |
  | freetext | FreeText | `/Rect`, `/DA`, `/DS` | text drawn with a standard-14 font (Helvetica, Times, Courier) |
  | rect / area | Square (`/IC` fill for area, `/BM Multiply`) | `/Rect`, `/RD` | — |
  | ellipse | Circle | — | — |
  | line / arrow | Line (`/L`, `/LE [/None /OpenArrow]`) | — | — |
  | polygon / polyline | Polygon / PolyLine (`/Vertices`) | — | — |

- **Every annotation** gets `/Type /Annot`, `/F 4` (Print), `/C`, `/CA`, `/NM`, `/T`, `/M`, `/CreationDate`, `/Contents` (plain text, always, because Preview and Acrobat show it), and `/RC` (XHTML generated from the Markdown) when the comment has formatting. A `/Popup` (with `/Parent`, `/Open false`, `/Rect` placed in the margin) is added when `contents` isn't empty. Replies are separate `Text` annotations with `/IRT` and `/RT /R`.
- **QuadPoints** are written in **Z order (TL, TR, BL, BR)**. Acrobat, Preview, PDFium and pdf.js all use this de facto order, even though the spec says counter-clockwise. **`/Rect` must contain every quad** with a margin, or pdf.js drops the quads.
- **Appearance streams** are always generated (`core/pdf-codec/appearance.ts`): a Form XObject with `/BBox` equal to `/Rect` and resources holding an `ExtGState` (`/CA`, `/BM /Multiply`). The same geometry code drives on-screen rendering, so screen and file match.
- **Lossless svelte-pdf-mini data, stored two ways:**
  1. On each annotation, a **private key** `/SPM_Data` (an ISO 32000 second-class name with our prefix; registering a prefix with ISO is optional, P2) holding compact JSON for the fields PDF can't express (`paletteKey`, `quote` prefix and suffix, `contentsFormat`, original Markdown, ink pressure, `extra`, schema version).
  2. At document level, an **embedded file** `svelte-pdf-mini.json` (in `/EmbeddedFiles` plus `/AF`) holding the full model keyed by `/NM`, plus document-level metadata (schema version, generator). Some re-serialisers keep embedded files but drop unknown keys; keeping both gives redundancy.
- **XMP:** add `spm:annotationsVersion` (P2).

### 9.2 Reader (`core/pdf-codec/read.ts`)
1. For each page's `/Annots`, read the raw dict with pdf-lib. If `/SPM_Data` or a matching `/NM` entry exists in the embedded JSON, rebuild the exact svelte-pdf-mini annotation, but **standard fields win when they differ** (so edits made in another app, such as Preview recolouring or moving a note, are respected). The rule: if `/M` is newer than the JSON's `modifiedAt`, merge the standard fields over it.
2. Otherwise map the standard annotation to the closest svelte-pdf-mini kind with `origin:'foreign'`. Text for markup comes from extracting the text under the quads via the text index. Quads come from the raw dict rather than pdf.js's axis-aligned version, so rotated quads survive.
3. **Preview quirks:**
   - Preview's own highlights have a broken `/AP`; we ignore their AP and regenerate it from the quads.
   - Preview re-saves the whole file, which can drop `/NM`, private keys and incremental history. Our fallback matches annotations by `(page, kind, quads ≈ ±1 pt, contents)` against the embedded JSON when it survives, and otherwise imports them as foreign.
4. Unsupported types (Widget, Link, FileAttachment, Sound, Redact, 3D, …) are left untouched and shown by pdf.js on the canvas.

### 9.3 Other exports
- `toJSON()` / `fromJSON()`: the canonical svelte-pdf-mini JSON.
- **Markdown summary** (Paperpile style): grouped by section (using the outline), with quote, comment, page link and colour.
- **Flattened PDF:** the AP content is merged into the page content, for printing or sharing without editable annotations.
- **W3C Web Annotation JSON-LD** for interoperability with Hypothesis-like tools (P2).

### 9.4 Validation (part of CI)
- **Round trip:** fixtures × generated annotations → export → import → deep-equal.
- **Independent engines:**
  - parse the exported file with **pdf.js** `getAnnotations` (types, quads, contents, `hasAppearance`);
  - parse it with **PDFium** via `@embedpdf/pdfium` (dev dependency only), which reads like Chrome;
  - run `qpdf --check` for structural validity.
- **Visual:** render export pages with pdf.js and PDFium and pixel-diff them against our on-screen render.
- **Manual checklist** (no automation possible): open in Preview, Acrobat Reader and Skim. Check that highlights are visible, comments readable, notes open, and that editing in Preview and re-importing works. Tracked in `apps/interop-lab` with a downloadable sample set.

---

## 10. Persistence boundary (what we deliberately leave to the host)

svelte-pdf-mini emits `onAnnotationsChange(list, ops)`, `onViewStateChange({page, zoom, scroll})` and document identity (`fingerprint`, optional `textHash`). Examples show localStorage persistence keyed by fingerprint. leed's `name_size` key collides; we avoid that. There is no IndexedDB, sync or account handling in the library.

---

## 11. Testing strategy

- **Unit (Vitest):** geometry, text normalisation and index mapping, search, reference parsing, citation regexes, quote anchoring, codec (with a pdf-lib round trip in Node).
- **Component (Vitest browser mode with Playwright):** state classes and controlled/uncontrolled props, virtualisation and cancellation (rapid zoom and scroll), selection to quads.
- **End-to-end and visual (Playwright):** each example route on Chromium, WebKit and Firefox, with screenshots per theme.
- **Fixture corpus** (`bun run fixtures` downloads and caches arXiv PDFs; nothing is committed):

  | arXiv | Why |
  |---|---|
  | 1706.03762 (Attention Is All You Need) | Classic one-column paper with hyperref, cites and figures |
  | 1512.03385 (ResNet) | Two-column CVPR layout, many figures and tables |
  | 2601.05637 | The paper you opened |
  | 2005.14165 (GPT-3) | 75 pages, stress test |
  | hep-th/9711200 (Maldacena) | Old TeX without hyperref, exercises the heuristic fallbacks |
  | 1312.6114 (VAE) | Lots of equations, equation destinations |
  | a biblatex author-year paper (to pick) | `(Author, Year)` citations |
  | a scanned or landscape PDF (to pick) | No text layer, rotation |

---

## 12. Documentation site and examples (`apps/docs`, SvelteKit + Tailwind v4)

One SvelteKit app serves the documentation and every example. All examples are real routes, and their source is shown next to them (imported with `?raw`), so the docs can never drift from working code.

**Docs** (`/docs/...`, written in mdsvex): getting started, concepts (layers, coordinates, controlled vs. uncontrolled state, styling with data attributes), one page per namespace (`Document`, `Viewer`, `Zoom`, `PageNav`, `Find`, `Outline`, `Thumbnails`, `Annotations`, `Aids`, `Export`) with an API table generated from the TypeScript prop types, plus guides (dark mode strategies, PDF interop, writing a citation provider, headless usage).

**Individual examples** (`/examples/<name>`: small, one feature each, and embedded in the matching docs page):

| Example | Shows |
|---|---|
| `minimal` | About 20 lines: `Document` plus `Viewer` with defaults. Also the bundle-size check |
| `sources` | URL, file input, drag-and-drop, `ArrayBuffer`, password-protected PDF, error state |
| `zoom` | Zoom steps, fit modes, `text` zoom, pinch and Ctrl+wheel |
| `scroll-modes` | Vertical, horizontal, wrapped, paged; rotation |
| `focus` | `goToPage`, `focus()` on rect, destination, quote, annotation; URL deep links (`?page=`, `?quote=`) |
| `dark-mode` | Every page-theme strategy side by side on a figure-heavy page |
| `find` | Find bar with options and results list |
| `outline-thumbnails` | Outline with active section, thumbnails |
| `text-selection` | Selection model, copy cleanup |
| `annotations-markup` | Highlight, underline, strike-out, squiggly, comments, undo |
| `annotations-draw` | Ink, shapes, free text, area highlight |
| `annotations-readonly` | Read-only and foreign-annotation policies |
| `export-import` | Export a PDF, re-import it, diff the model |
| `links-previews` | Link layer and hover previews |
| `citations` | Citation cards with the default provider |
| `headless` | State classes only, no components |

**Integrated apps** (`/apps/<name>`: complete use cases combining everything):

| App | Use case |
|---|---|
| `reader` | **Research reader in the style of Google Scholar**: toolbar, outline with active section, thumbnails, find, citation cards, link previews, back button, highlights with margin comments, dark-mode picker, URL position |
| `annotator` | Annotation workspace: every tool, annotation sidebar with crops, localStorage persistence keyed by fingerprint, export to PDF and Markdown |
| `library` | Paper library: grid of arXiv first-page thumbnails, quick-look modal viewer, open in reader |
| `compare` | Two versions of an arXiv paper side by side with synchronised scroll and quote-anchored annotations |
| `interop-lab` | Round-trip bench: drop any PDF (for example one annotated in Preview or Acrobat), raw dict versus model view, export, re-import, diff, sample set for manual checks |
| `embed` | A viewer embedded in a blog-style article: inline single page, citation popover, "open full paper" |
| `mobile` | Touch-first reader: pinch, long-press to highlight, bottom-sheet menus |
| `stress` | GPT-3 (75 pages) and a 1,000-page synthetic PDF with FPS and memory overlay |

## 13. Milestones

1. **M0 Foundations:** bun monorepo, core loader and scheduler, `Document` / `Viewer` / `Page` / `Canvas` / `TextLayer`, zoom and scroll modes, `goToPage` and `focus`, dark-mode strategies `none`/`invert`/`dim`/`recolor`. Docs-site skeleton; examples `minimal`, `sources`, `zoom`, `scroll-modes`, `focus`, `dark-mode`.
2. **M1 Text and find:** text index, selection model, find, copy cleanup, outline, thumbnails, link layer, navigation history.
3. **M2 Annotations:** the model and store, undo, text markup and notes, SelectionMenu, margin, list, **PDF codec with round trip and the interop lab**.
4. **M3 Reading aids:** destination classification, previews, reference parsing, citation cards with providers, figures index, heuristic outline, active section. The full `/reader` example.
5. **M4 Shapes and polish:** ink, shapes, free text, touch, i18n and a11y pass, stress tests, docs.

---

## 14. Decisions (answered)

1. **Name:** `svelte-pdf-mini`.
2. **Packaging:** a single, well-formed Svelte library package (SvelteKit library mode, `svelte-package`, `publint`, typed subpath exports), plus one docs-and-examples site with individual examples and integrated app examples (§12).
3. **Editable and read-only:** both are supported, through a global `readonly` prop, a per-annotation `locked` flag and a `foreignAnnotations` policy (A13).
4. **Citation provider:** a chained default (OpenAlex first, Semantic Scholar enrichment when a key is configured), with every provider swappable (§8.3).
5. **Dark mode:** several strategies through a pluggable API: `invert`, `smart-invert`, `dim`, `recolor`, `vector-recolor` and custom (D2, D3).
6. **Browser floor:** latest evergreen browsers only, with the latest upstream versions of every dependency.
