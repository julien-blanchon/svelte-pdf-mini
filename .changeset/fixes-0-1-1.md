---
'svelte-pdf-mini': patch
---

Fixes and polish:

- pdf.js is loaded lazily again (it was pulled into the initial bundle by a static import), and `configurePdf({ workerPort })` works with the shared worker.
- The hand ("Pan") tool now drags the pages to scroll, with grab / grabbing cursors; the minimap shows a grabbing cursor while scrubbing.
- Keyboard navigation: arrow keys move between annotations again after selecting a read-only one; outline items without a target stay focusable (`aria-disabled`); Toc.Tree parents expose `aria-expanded`.
- Screen-reader announcements and annotation kind names can be translated through `messages`.
