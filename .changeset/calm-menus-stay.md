---
'svelte-pdf-mini': patch
---

- **Selection menu placement:** anchored to the box of the selected characters (not the last line, nor the text layer's oversized helper elements), centered above it; below it when there is no room above within the pages' area (it never covers the app's toolbars); kept inside the view for a selection taller than it. `float()` gains `clamp` and `boundary` options.
- **No previews while selecting:** while a text selection is dragged (`data-selecting` on the viewport), links, citations, cross-references, backlink targets and annotations let the pointer through, so no preview or hover card opens and the selection can't jump to an overlay's edge.
- **Zoom limits:** `Viewer.Root minZoom` / `maxZoom` (defaults 0.1 and 10) bound every way of zooming; `viewer.minZoom` / `viewer.maxZoom` expose them.
- **One focus effect:** figures, tables and equations get the filled pulse, like references and citations; jumping to a note from `Annotations.List` scrolls to it and selects it, without a flash.
- **Find:** ↓ / ↑ in `Find.Input` go to the next / previous match (as Enter / Shift+Enter).
- **No focus ring around the document:** the viewport keeps keyboard focus without an outline (`--pdf-viewport-focus-ring` brings one back).
