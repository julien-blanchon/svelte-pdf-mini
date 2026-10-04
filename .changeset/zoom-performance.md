---
'svelte-pdf-mini': patch
---

Zoom performance: while a zoom animates, text layers leave rendering (`display: none` under `[data-zooming]`), so their spans aren't re-styled and re-laid out every frame (WebKit p95 frame time 31 → 24 ms, Chromium layout time ÷5).
