---
'svelte-pdf-mini': patch
---

Backspace or Delete discards a new annotation only as the very first key in its popover. Once you touch it (any other key, a click into a field, or a note or box label already written), Backspace edits the text as usual: erasing a box label, or pressing Backspace once more than there are letters, no longer deletes the annotation.
