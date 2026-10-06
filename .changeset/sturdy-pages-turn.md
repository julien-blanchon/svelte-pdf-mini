---
'svelte-pdf-mini': minor
---

Fixes and hardening from a review of 0.4.0.

- **Rotated pages:** the text layer is rotated onto the page at 90°, 180° and 270° (pdf.js lays it out unrotated), so selection, find and copy line up with the canvas.
- **Fit modes within zoom limits:** a fit wider than `maxZoom` (or narrower than `minZoom`) is clamped and stays a fit, instead of silently turning into a manual zoom that stops following the view. `minZoom` / `maxZoom` are validated (a `maxZoom` below `minZoom` is raised to it), changing them re-clamps the zoom, and an initial or controlled zoom outside them reads as clamped.
- **Text selection:** boundaries on or around the end-of-content element that steering moves map to the nearest text, so a drag no longer drops a page's selection for a frame; the selection box is only measured once the drag ends, walking just the selected text. A touch pan (`pointercancel`) ends the drag. Steering only resets the layers it changed, resets the ones the selection leaves, handles right-to-left text when anchoring a press in a gap, and clears its state when the last layer goes.
- **Spreads with the cover alone:** page 1 has no neighbor (its side notes are no longer gap markers next to an empty cell).
- **Figures in non-English papers:** text columns and running text are detected by line shape in papers that aren't in English (French, German, CJK…); English papers are unchanged.
- **Find:** ↑ / ↓ and Enter don't step through matches while an input method (Japanese, Chinese…) is composing.
- **Previews:** an open link or cross-reference preview re-renders when the reading theme changes.
- Docs: zoom limits and `zoomLocked`, `data-selecting`, `data-placement="gap"`, `--pdf-viewport-focus-ring`.
