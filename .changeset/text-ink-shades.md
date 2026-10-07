---
'svelte-pdf-mini': minor
---

Colored text reads on every page theme.

- **Text boxes** draw their text in an ink shade of their color (same hue and chroma, lightness at most 0.5 by day and at least 0.75 by night) instead of the pastel fill, so all eight palette colors reach 4.5:1 on light, tinted and dark pages. Text boxes now set `--annotation-ink` (not `--annotation-color`) for their text.
- **`inkCss(color, dark)`** returns that shade for any CSS color. `PaletteColor` and `PaperColor` take optional `ink` / `inkDark` overrides; `paletteInk(entry, dark)` and `paperInk(color, dark)` resolve them, for example to pass a paper accent as `--pdf-accent`.
