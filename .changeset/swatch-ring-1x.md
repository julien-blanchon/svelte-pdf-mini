---
'svelte-pdf-mini': patch
---

The selected color's ring in the selection menu and annotation popover is concentric on 1x screens: there it uses whole pixels (1px halo + 2px ring, same outer size) instead of a 1.5px spread, which WebKitGTK drew lopsided. 2x screens are unchanged.
