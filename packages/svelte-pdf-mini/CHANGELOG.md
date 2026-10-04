# svelte-pdf-mini

## 0.1.1

### Patch Changes

- [`596b63f`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/596b63f939092b98c0a302d281d4278b32b898dc) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Fixes and polish:
  
  - pdf.js is loaded lazily again (it was pulled into the initial bundle by a static import), and `configurePdf({ workerPort })` works with the shared worker.
  - The hand ("Pan") tool now drags the pages to scroll, with grab / grabbing cursors; the minimap shows a grabbing cursor while scrubbing.
  - Keyboard navigation: arrow keys move between annotations again after selecting a read-only one; outline items without a target stay focusable (`aria-disabled`); Toc.Tree parents expose `aria-expanded`.
  - Screen-reader announcements and annotation kind names can be translated through `messages`.

- [`596b63f`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/596b63f939092b98c0a302d281d4278b32b898dc) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - Every user-facing label can now be translated through `messages` (annotation, citation-card, reference, link-preview and outline labels that were still hard-coded English).

## 0.1.0

### Minor Changes

- [`8341e9a`](https://github.com/julien-blanchon/svelte-pdf-mini/commit/8341e9afecf3aa4055903f380f3c6b4883a5031d) Thanks [@julien-blanchon](https://github.com/julien-blanchon)! - First public release: headless PDF viewer and research-paper reader components for Svelte 5 (viewer, find, outline, thumbnails, minimap, annotations with PDF round trip, citations, tables of contents, context menus and shortcuts).
