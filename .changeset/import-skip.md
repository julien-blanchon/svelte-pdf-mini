---
'svelte-pdf-mini': patch
---

Importing a PDF's annotations skips pdf-lib when pdf.js finds none to import (no supported annotation, no embedded model, not encrypted): no copy of the whole file and no main-thread parse when opening most papers.
