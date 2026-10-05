---
'svelte-pdf-mini': patch
---

- **Selection menu placement:** anchored to the box of the selected characters (not the last line, nor the text layer's oversized helper elements), centered above it; below it when there is no room above within the pages' area (it never covers the app's toolbars); kept inside the view for a selection taller than it. `float()` gains `clamp` and `boundary` options.
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
