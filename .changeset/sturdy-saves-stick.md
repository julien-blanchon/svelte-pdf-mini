---
'svelte-pdf-mini': minor
---

Saving annotations is sturdier.

- **Encrypted PDFs:** PDFs with an owner password but no password to open (common for publisher PDFs) can now be saved. `exportPdf` decrypts them and writes a full, unencrypted copy (the owner password's restrictions are not kept). Their foreign annotations are also read with their real text instead of ciphertext. A PDF that needs a password to open can't be saved without stripping that protection: `exportPdf` throws a `PdfSaveError` (`reason: 'password'`).
- **Know before annotating:** `saveSupport(bytes)` returns `{ encrypted, canSave, saveBlockedReason? }`; `importAnnotations` returns it as `result.saveSupport`, and `AnnotationStore.saveSupport` holds it after `importFromPdf`. `importAnnotations` takes a `password` option to read the text of a file that needs one.
- **Deleting a foreign annotation sticks:** a highlight from Preview or Acrobat deleted in the `'editable'` foreign mode no longer comes back on reopen. The store lists the deleted ones in `removedForeign`, and `exportPdf`'s new `remove` option deletes them (with their popups). `store.exportPdf()` passes it for you; when you call `exportPdf` yourself, pass `{ remove: store.removedForeign }`. Read-only and hidden foreign annotations are kept as before.
- **Popups** of every annotation the writer removes (edited foreign ones, `prune: 'all'`) are removed with it.
- **Bytes before `%PDF-`:** they are dropped on export, so the saved file starts with the header, and the update matches the file's cross-reference format. When the file's offsets count those bytes, the export is a full rewrite.
- **Paper color pickers:** `paperSwatches` (white, warm paper and the `paperColors` palette, typed `PaperSwatch`) and `paperHex(value, dark)` (a swatch value or `#hex` → the color for `pageThemes.paper`) are now exported next to `paperColors`.
