---
'svelte-pdf-mini': patch
---

Figure, link, cross-reference and crop previews free their page after rendering, and render (like thumbnails) with the pages' annotation mode: a page shown in both is no longer parsed and decoded twice. Analysis on the shown document keeps the pages on screen. `PdfDocument.renderRegion` takes `{ signal, theme }`.
