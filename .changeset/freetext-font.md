---
'svelte-pdf-mini': minor
---

Text box fonts. A text box can be handwritten, sans, serif or mono, and the app picks the typefaces.

- **Model:** `FreeTextAnnotation.font.family` is a `FreeTextFontFamily`: the new `'Handwritten'`, plus `'Helvetica'` (sans), `'Times'` (serif) and `'Courier'` (mono) as before. `FREETEXT_FONT_FAMILIES` lists them in menu order.
- **Rendering:** a text box's `font-family` comes from a CSS custom property, so apps choose (and bundle) the faces: `--pdf-font-handwritten` (fallback: Shantell Sans if installed, else a system marker face), `--pdf-font-sans` (Helvetica, Arial), `--pdf-font-serif` (Times New Roman) and `--pdf-font-mono` (Courier New). `freetextFontCss(family)` returns that value. `data-font` still names the family.
- **Store:** the `freetextFont` option (`Annotations.Root` prop, default `'Helvetica'`) is the family of new text boxes; `store.setFont(ids, family)` changes existing ones. The context menu of a text box has a *Font* submenu; its entries carry `action.font` (the CSS family) so menus can show each choice in its own font. New messages: `font`, `fontHandwritten`, `fontHelvetica`, `fontTimes`, `fontCourier`.
- **PDF:** the exact family is kept in svelte-pdf-mini's private data. `/DA`, `/DS` and the appearance stream use the closest standard font (`standardFontOf`): Helvetica for handwritten and sans, Times for serif, Courier for mono. The typeface itself is not embedded, so files stay small and need no font tooling.
