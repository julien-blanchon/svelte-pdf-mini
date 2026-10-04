---
"svelte-pdf-mini": minor
---

- **Equations:** numbered display equations ("… (3)") are detected as figures of kind `equation` (box, label, caption), so they get previews, "Box it", "Copy as image" and backlinks. "Eq. (3)" references resolve to them. `Paper.Figures` lists them when `kinds` includes `'equation'`.
- **Backlinks:** `paper.mentions` maps every figure / table / equation / section to the cross-references pointing at it; `Paper.Layer` adds hover targets on labels ("Figure 3", "(2)", headings) and the new `Paper.Backlinks` card lists each mention with its sentence (click to jump). Figures get a "Mentions" submenu in `contextActions`. Figures have a new `labelRect`.
- Right-clicking a text selection no longer clears it.
- A wheel over a link preview scrolls the document (and closes the preview) instead of what is behind it.
- The annotation popover only offers the markup styles allowed by `tools`.
- Rounded page corners clip GPU-composited canvases in WebKit (`clip-path`).
