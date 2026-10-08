---
'svelte-pdf-mini': patch
---

The transform zoom (0.9.0) is now opt-in (`transformZoom`, default false): zoom gestures lay the pages out at every step again, as before 0.9.0, where fixed-size parts (notes, handles, page gaps) never scale and snap back. With `transformZoom` on, a gesture now lands exactly where it shows (pages narrower than the view stay centered, never scrolled past the first or last page) and stays sharp while it runs (pages drawn at the zoom shown, text and annotations redrawn crisply).
