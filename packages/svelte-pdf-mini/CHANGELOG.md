# svelte-pdf-mini

## 0.7.0

### Minor Changes

- Emoji notes. A note can show an emoji instead of the speech-bubble icon.
  
  - **Model:** `NoteAnnotation.emoji` (one grapheme). The PDF keeps it exactly in svelte-pdf-mini's private data. `/Name` gets the closest standard icon (💬 Comment, 🤔 Help, 💡 Key, 📌 Note, anything else Comment, see `noteIconFor`), so Preview and Acrobat show a sensible icon. The appearance stream is still the colored speech bubble, because a color emoji can't be drawn with the standard PDF fonts.
  - **Store:** the `noteEmojis` option (`Annotations.Root` prop) enables it, e.g. `noteEmojis={defaultNoteEmojis}` (💬 🤔 💡 🤯 🧐 🤨 😍 📌). When the note tool is active, or the selected (or just created) annotations are notes, keys 1–8 pick an emoji instead of a color, and `store.pickingNoteEmoji` is true. `store.noteEmoji` (bindable `noteEmoji`, `onNoteEmojiChange`) is the emoji new notes get, `store.pickNoteEmoji(emoji)` picks one, and `store.setNoteEmoji(ids, emoji)` changes notes. Without `noteEmojis`, nothing changes.
  - **UI:** `Annotations.NoteEmoji` is a toolbar button for one emoji. The emoji shows on the page marker (scaled with the zoom), in `Annotations.Margin` notes and markers, and in the default hover card and list. Snippets get it as `emoji`. `toMarkdown` writes it in place of the color. `isSingleEmoji(value)` validates user input.

- [`a9351e1`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/a9351e11d094f4c9d0b43c56a364b77e4a6bb404) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Colored text reads on every page theme.
  
  - **Text boxes** draw their text in an ink shade of their color (same hue and chroma, lightness at most 0.5 by day and at least 0.75 by night) instead of the pastel fill, so all eight palette colors reach 4.5:1 on light, tinted and dark pages. Text boxes now set `--annotation-ink` (not `--annotation-color`) for their text.
  - **`inkCss(color, dark)`** returns that shade for any CSS color. `PaletteColor` and `PaperColor` take optional `ink` / `inkDark` overrides; `paletteInk(entry, dark)` and `paperInk(color, dark)` resolve them, for example to pass a paper accent as `--pdf-accent`.

## 0.6.0

### Minor Changes

- Saving annotations is sturdier.
  
  - **Encrypted PDFs:** PDFs with an owner password but no password to open (common for publisher PDFs) can now be saved. `exportPdf` decrypts them and writes a full, unencrypted copy (the owner password's restrictions are not kept). Their foreign annotations are also read with their real text instead of ciphertext. A PDF that needs a password to open can't be saved without stripping that protection: `exportPdf` throws a `PdfSaveError` (`reason: 'password'`).
  - **Know before annotating:** `saveSupport(bytes)` returns `{ encrypted, canSave, saveBlockedReason? }`; `importAnnotations` returns it as `result.saveSupport`, and `AnnotationStore.saveSupport` holds it after `importFromPdf`. `importAnnotations` takes a `password` option to read the text of a file that needs one.
  - **Deleting a foreign annotation sticks:** a highlight from Preview or Acrobat deleted in the `'editable'` foreign mode no longer comes back on reopen. The store lists the deleted ones in `removedForeign`, and `exportPdf`'s new `remove` option deletes them (with their popups). `store.exportPdf()` passes it for you; when you call `exportPdf` yourself, pass `{ remove: store.removedForeign }`. Read-only and hidden foreign annotations are kept as before.
  - **Popups** of every annotation the writer removes (edited foreign ones, `prune: 'all'`) are removed with it.
  - **Bytes before `%PDF-`:** they are dropped on export, so the saved file starts with the header, and the update matches the file's cross-reference format. When the file's offsets count those bytes, the export is a full rewrite.
  - **Paper color pickers:** `paperSwatches` (white, warm paper and the `paperColors` palette, typed `PaperSwatch`) and `paperHex(value, dark)` (a swatch value or `#hex` → the color for `pageThemes.paper`) are now exported next to `paperColors`.

### Patch Changes

- Floating parts (selection menu, annotation popover and hover card, citation card, cross-reference and link previews, backlinks) now use CSS anchor positioning: they move with the pages in the same frame as the scroll, with no lag or jitter. The selection menu now follows the selected text (it used to stay where it opened). A part hides once its anchor is scrolled out of the pages' view, unless it holds the focus (a note being typed). The floating element no longer gets a `data-side` attribute.

- Links in the page show the pointer cursor in WebKit too.

## 0.5.0

### Minor Changes

- Fixes and hardening from a review of 0.4.0.
  
  - **Rotated pages:** the text layer is rotated onto the page at 90°, 180° and 270° (pdf.js lays it out unrotated), so selection, find and copy line up with the canvas.
  - **Fit modes within zoom limits:** a fit wider than `maxZoom` (or narrower than `minZoom`) is clamped and stays a fit, instead of silently turning into a manual zoom that stops following the view. `minZoom` / `maxZoom` are validated (a `maxZoom` below `minZoom` is raised to it), changing them re-clamps the zoom, and an initial or controlled zoom outside them reads as clamped.
  - **Text selection:** boundaries on or around the end-of-content element that steering moves map to the nearest text, so a drag no longer drops a page's selection for a frame; the selection box is only measured once the drag ends, walking just the selected text. A touch pan (`pointercancel`) ends the drag. Steering only resets the layers it changed, resets the ones the selection leaves, handles right-to-left text when anchoring a press in a gap, and clears its state when the last layer goes.
  - **Spreads with the cover alone:** page 1 has no neighbor (its side notes are no longer gap markers next to an empty cell).
  - **Figures in non-English papers:** text columns and running text are detected by line shape in papers that aren't in English (French, German, CJK…); English papers are unchanged.
  - **Find:** ↑ / ↓ and Enter don't step through matches while an input method (Japanese, Chinese…) is composing.
  - **Previews:** an open link or cross-reference preview re-renders when the reading theme changes.
  - Docs: zoom limits and `zoomLocked`, `data-selecting`, `data-placement="gap"`, `--pdf-viewport-focus-ring`.

## 0.4.0

### Minor Changes

- **Selection menu placement:** anchored to the box of the selected characters (not the last line, nor the text layer's oversized helper elements), centered above it; below it when there is no room above within the pages' area (it never covers the app's toolbars); kept inside the view for a selection taller than it.
  - **No previews while selecting:** while a text selection is dragged (`data-selecting` on the viewport), links, citations, cross-references, backlink targets and annotations let the pointer through, so no preview or hover card opens and the selection can't jump to an overlay's edge.
  - **Zoom limits:** `Viewer.Root minZoom` / `maxZoom` (defaults 0.1 and 10) bound every way of zooming; `viewer.minZoom` / `viewer.maxZoom` expose them.
  - **One focus effect:** figures, tables and equations get the filled pulse, like references and citations; jumping to a note from `Annotations.List` scrolls to it and selects it, without a flash.
  - **Find:** ↓ / ↑ in `Find.Input` go to the next / previous match (as Enter / Shift+Enter).
  - **No focus ring around the document:** the viewport keeps keyboard focus without an outline (`--pdf-viewport-focus-ring` brings one back).
  - **Side notes in spreads and grids:** a page with another page beside it on the notes side (spreads, Auto's grid, horizontal strips) shows markers just past its edge, painted above the neighbor, never full notes over it; thumbnail-sized pages show markers too. New `viewer.hasNeighbor(page, side)`.
  - **Box labels shrink with the page** when zoomed out.
  - A box with only a label (drawn on the box) gets no side note, line marker or hover card.
  - **Previews follow the reading theme:** cross-reference and link previews render with the pages' theme (night recoloring, tint, page color), not pdf.js's white page. `renderRegionToCanvas` takes a `theme`.
  - **`Viewer.Root zoomLocked`:** user zooming (pinch, wheel, shortcuts, `zoomTo`, zoom mode changes) does nothing while set; a fit mode keeps fitting the view.
  - **Figure, table and equation regions** (reviewed on 35 papers): display equations are the whole run of math rows around their number, as wide as their column (multi-line `align` included, intro and following text excluded); figures and tables are widened to their text column when they nearly fill it, padded, and limited to their half for side-by-side or wrapped (`wrapfigure`) ones; clipped images are measured by their clip (a cropped strip no longer swallows the next figure); a region never runs into another figure's caption; tables and algorithms end at their closing rule; algorithms read their body below the header; figures with no graphics found take the blank band above their caption. Chart labels like "(13×)" are no longer read as equation numbers.
  - **Text selection in WebKit (Safari, the macOS desktop webview):** a drag over the gaps between lines no longer jumps to the start or end of the page (WebKit bug 307340): the text layer's end element follows the selection's moving end while dragging (as in pdf.js's viewer), and a press in a gap anchors the selection just before the nearest text, as in Chromium.

## 0.3.0

### Minor Changes

- **Styles live in a cascade layer.** `styles.css` and every component style sit in `@layer svelte-pdf-mini`, so any unlayered app CSS, and Tailwind utilities once the layer order is declared, override them (`class="overflow-hidden"` on `Thumbnails.Root` now wins). With Tailwind v4, declare `@layer theme, base, svelte-pdf-mini, components, utilities;` in your HTML `<head>`, before any stylesheet loads (see README › Styling).
  - **New `svelte-pdf-mini/pdf-codec` entry point**: read and write annotations in PDF files (`importAnnotations`, `exportPdf`, JSON / Markdown serializers) without the Svelte components.
  - **Clipboard:** `setClipboard({ text, rich, image })` routes every copy through your writer (e.g. a desktop app's native clipboard); `copyText()` and `hasCustomClipboard()` are exported.
  - **Ink smoothing:** `Annotations.Root inkSmoothing` (`'smooth'` default, `'steady'`, `'pen'`, `'raw'`) and the `smoothStroke()` helper; the live stroke shows the same smoothing.
  - **Shortcuts anywhere:** `Viewer.Root keyboard="document"` listens outside the viewport too (not in text fields, dialogs or menus); `viewer.isStrayKey(e)` tells apps which keys are the viewer's.
  - **Side notes fit tight windows:** `Annotations.Margin` narrows notes (`minWidth` now 140) and, when the room beside the page is short, lets them cover the page's blank margin (never its text) before falling back to markers.
  - **Hover cards:** no card for a box with only a label (it's drawn on the box) or over a side note (it already shows the note); cards open at their final size (notes render during the hover delay, and rendered notes come from a cache).
  - **`forceMount` parts skip the default pop-in animation**, so an app's own transition no longer runs on top of it.
  - **One hover style for links in the text:** citations, cross-references and labels mentioned elsewhere share `--pdf-ref-hover` (replaces `--pdf-citation-hover`, `--pdf-crossref-hover`, `--pdf-backlink-hover` and `--pdf-backlink-line`).
  - **Highlights under the text:** highlights are drawn between the page bitmap and the text (blend `multiply` by day, `lighten` by night), so glyphs stay crisp and dark.
  - Zooming with a text selection keeps it; resizing the view (e.g. a side panel opening) keeps the reading position, and a document scrolled to the very top stays there.
  - `Viewer.LinkLayer`'s `child` gets a `links` snippet to render the hotspots inside your element.
  - `SelectionMenuSnippetProps` and `PopoverSnippetProps` are exported.
  - Breaking: the deprecated `viewer.backStack`, `forwardStack`, `canGoBack` and `canGoForward` are gone; use `viewer.history.back`, `.forward`, `.canGoBack`, `.canGoForward`.
  
  Fixes:
  
  - `Paper.Backlinks` no longer loops (`effect_update_depth_exceeded`) when its card opens a second time.
  - Edits to imported annotations without a `/M` date are written on export (they were kept as the original).
  - Switching documents mid-load no longer leaks the stale load in the shared worker; back/forward history is cleared; late annotation imports, re-anchoring results and reference metadata for the previous document are dropped; an edit made while re-anchoring runs is kept.
  - Resize handles move the right edge on rotated pages; back/forward and `restorePosition` land correctly on rotated or cropped pages; the reading point and minimap markers handle `/Rotate` and crop boxes.
  - Uncontrolled annotation lists are plain arrays again (not deep `$state` proxies), so `structuredClone`, IndexedDB and `postMessage` accept them.
  - Discarding one markup of a multi-page selection keeps the others undoable.
  - Outlined ellipses and polygons are hit on their outline, not their bounding box.
  - `onOpenChange` fires on changes only (not on mount) and doesn't re-run on what the callback reads.
  - Leaks: canvases of cancelled renders, a progressive render landing on a released page, failed operator lists cached forever, thumbnails of a previous document, the analysis worker when opening its copy fails, window listeners of a drag interrupted by unmount, abort listeners in provider waits.
  - One caller aborting a shared provider request no longer fails the other callers.
  - Link URLs that pdf.js rejects as unsafe are no longer exposed in `paper.links`.
  - Find stops reading pages once it reaches its match limit.
  - Notes: "$5 and $10" is no longer typeset as maths; links in notes open in a new tab through a DOMPurify hook.
  - Author detection keeps names such as "Metallinou" or "Brainard".
  - Keyboard: citation, cross-reference and link hotspots open their previews on focus; side notes are `role="group"` with a label.
  - `configurePdf` warns when worker settings arrive after the first document; a later `bitmapCacheBytes` resizes the cache.

## 0.2.0

### Minor Changes

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - - **Equations:** numbered display equations ("… (3)") are detected as figures of kind `equation` (box, label, caption), so they get previews, "Box it", "Copy as image" and backlinks. "Eq. (3)" references resolve to them. `Paper.Figures` lists them when `kinds` includes `'equation'`.
  - **Backlinks:** `paper.mentions` maps every figure / table / equation / section to the cross-references pointing at it; `Paper.Layer` adds hover targets on labels ("Figure 3", "(2)", headings) and the new `Paper.Backlinks` card lists each mention with its sentence (click to jump). Figures get a "Mentions" submenu in `contextActions`. Figures have a new `labelRect`.
  - Right-clicking a text selection no longer clears it.
  - A wheel over a link preview scrolls the document (and closes the preview) instead of what is behind it.
  - The annotation popover only offers the markup styles allowed by `tools`.
  - Rounded page corners clip GPU-composited canvases in WebKit (`clip-path`).

### Patch Changes

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - - `Annotations.Root` takes `tools`: the tools / text markups an app offers. Others get no shortcut, selection-menu or context-menu entry, and are left out of the shortcut list.
  - Highlights are translucent (`--pdf-highlight-opacity`, default 0.45) as well as blended, so text stays readable where WebKit doesn't blend over a GPU canvas, and they cover the line slightly beyond the glyph box.
  - Rounded page frames no longer show a white rim: the page box takes the page theme's colour.
  - No more `binding_property_non_reactive` dev warnings.
  - Off-screen text layers (and all of them while a zoom animates) use `content-visibility: hidden`, skipping their layout.

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - `contextActions` accepts `saveFile(blob, name)` so desktop webviews (which ignore `<a download>`) can route "Save as PNG" through a native save dialog. New `canvasToPng()` helper.

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - `Viewer.Root` takes `focusHighlight`: the effect used when a link lands on a figure, table or section (default `'pulse'`), including custom recipe names rendered through `Viewer.Focus`'s `child`.

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Docs: `optimizeDeps: { exclude: ['pdfjs-dist'] }` is required in Vite apps; without it `vite dev` fails to load the pdf.js worker (`?url`) during dependency pre-bundling.

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Fix: no text layer, selection or search in WKWebView (macOS 26 system webview, e.g. Tauri apps). pdf.js 6 iterates `ReadableStream`s with `for await`, which WKWebView doesn't ship yet; the standard iterator is now installed when missing, on the main thread and in the pdf.js worker.

- [`2710500`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/2710500408dc7bcf66b0c35d3d288e57439ea453) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Zoom performance: while a zoom animates, text layers leave rendering (`display: none` under `[data-zooming]`), so their spans aren't re-styled and re-laid out every frame (WebKit p95 frame time 31 → 24 ms, Chromium layout time ÷5).

## 0.1.1

### Patch Changes

- [`596b63f`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/596b63f939092b98c0a302d281d4278b32b898dc) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Fixes and polish:
  
  - pdf.js is loaded lazily again (it was pulled into the initial bundle by a static import), and `configurePdf({ workerPort })` works with the shared worker.
  - The hand ("Pan") tool now drags the pages to scroll, with grab / grabbing cursors; the minimap shows a grabbing cursor while scrubbing.
  - Keyboard navigation: arrow keys move between annotations again after selecting a read-only one; outline items without a target stay focusable (`aria-disabled`); Toc.Tree parents expose `aria-expanded`.
  - Screen-reader announcements and annotation kind names can be translated through `messages`.

- [`596b63f`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/596b63f939092b98c0a302d281d4278b32b898dc) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Every user-facing label can now be translated through `messages` (annotation, citation-card, reference, link-preview and outline labels that were still hard-coded English).

## 0.1.0

### Minor Changes

- [`8341e9a`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/8341e9afecf3aa4055903f380f3c6b4883a5031d) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - First public release: headless PDF viewer and research-paper reader components for Svelte 5 (viewer, find, outline, thumbnails, minimap, annotations with PDF round trip, citations, tables of contents, context menus and shortcuts).
