---
'svelte-pdf-mini': minor
---

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
