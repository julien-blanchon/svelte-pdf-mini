---
"svelte-pdf-mini": patch
---

`contextActions` accepts `saveFile(blob, name)` so desktop webviews (which ignore `<a download>`) can route "Save as PNG" through a native save dialog. New `canvasToPng()` helper.
