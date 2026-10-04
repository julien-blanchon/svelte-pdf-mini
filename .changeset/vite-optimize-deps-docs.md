---
"svelte-pdf-mini": patch
---

Docs: `optimizeDeps: { exclude: ['pdfjs-dist'] }` is required in Vite apps; without it `vite dev` fails to load the pdf.js worker (`?url`) during dependency pre-bundling.
