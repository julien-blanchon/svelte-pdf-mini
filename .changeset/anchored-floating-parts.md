---
'svelte-pdf-mini': patch
---

Floating parts (selection menu, annotation popover and hover card, citation card, cross-reference and link previews, backlinks) now use CSS anchor positioning: they move with the pages in the same frame as the scroll, with no lag or jitter. The selection menu now follows the selected text (it used to stay where it opened). A part hides once its anchor is scrolled out of the pages' view, unless it holds the focus (a note being typed). The floating element no longer gets a `data-side` attribute.
