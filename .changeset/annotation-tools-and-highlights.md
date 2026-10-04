---
"svelte-pdf-mini": patch
---

- `Annotations.Root` takes `tools`: the tools / text markups an app offers. Others get no shortcut, selection-menu or context-menu entry, and are left out of the shortcut list.
- Highlights are translucent (`--pdf-highlight-opacity`, default 0.45) as well as blended, so text stays readable where WebKit doesn't blend over a GPU canvas, and they cover the line slightly beyond the glyph box.
- Rounded page frames no longer show a white rim: the page box takes the page theme's colour.
- No more `binding_property_non_reactive` dev warnings.
- Off-screen text layers (and all of them while a zoom animates) use `content-visibility: hidden`, skipping their layout.
