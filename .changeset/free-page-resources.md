---
'svelte-pdf-mini': patch
---

Free what pdf.js keeps for a page (operator list, decoded images) once it leaves the render range, after a thumbnail or minimap render, and after paper analysis: an image-heavy paper no longer stays in memory whole (a 92 MB paper: ~2 GB → ~1.1 GB in WKWebView). Pages near the viewport are pinned, so thumbnails never free them.
