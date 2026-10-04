---
"svelte-pdf-mini": patch
---

Fix: no text layer, selection or search in WKWebView (macOS 26 system webview, e.g. Tauri apps). pdf.js 6 iterates `ReadableStream`s with `for await`, which WKWebView doesn't ship yet; the standard iterator is now installed when missing, on the main thread and in the pdf.js worker.
