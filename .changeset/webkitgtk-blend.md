---
'svelte-pdf-mini': patch
---

Highlights show on Linux (WebKitGTK: Tauri, Epiphany). WebKitGTK ignores `mix-blend-mode` on GPU-composited canvases, so the page bitmap painted opaque over the highlight underlay (and the page tint). There, page, cached and preview canvases are now created with `willReadFrequently`, which keeps them in software where blending works. Other browsers are unchanged.
