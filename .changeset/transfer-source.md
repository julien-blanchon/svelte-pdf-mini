---
'svelte-pdf-mini': minor
---

`PdfSource` accepts `{ data, transfer: true }`: the bytes are handed over to pdf.js's worker instead of copied (the caller's buffer is emptied), so a large PDF isn't held twice (a 92 MB paper: ~1.4 GB → ~1.0 GB in WKWebView).
