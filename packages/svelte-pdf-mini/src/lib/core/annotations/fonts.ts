/** Text box font families: their order in menus, the CSS that draws them, and the PDF fonts they map to. */
import type { FreeTextFontFamily } from './model.js';

/** Every text box font family, in menu order. */
export const FREETEXT_FONT_FAMILIES: readonly FreeTextFontFamily[] = [
	'Handwritten',
	'Helvetica',
	'Times',
	'Courier'
];

/**
 * CSS `font-family` per family. Each reads a custom property first, so apps
 * choose (and bundle) the typefaces: `--pdf-font-handwritten`,
 * `--pdf-font-sans`, `--pdf-font-serif`, `--pdf-font-mono`. Without them:
 * Shantell Sans if installed, else a system marker-style face; and the
 * system's Helvetica / Times / Courier lookalikes.
 */
const FONT_CSS: Record<FreeTextFontFamily, string> = {
	Handwritten:
		"var(--pdf-font-handwritten, 'Shantell Sans', 'Chalkboard SE', 'Segoe Print', 'Comic Sans MS', sans-serif)",
	Helvetica: 'var(--pdf-font-sans, Helvetica, Arial, sans-serif)',
	Times: "var(--pdf-font-serif, 'Times New Roman', Times, serif)",
	Courier: "var(--pdf-font-mono, 'Courier New', Courier, monospace)"
};

/** CSS `font-family` value for a text box family (unknown values draw as sans). */
export function freetextFontCss(family: FreeTextFontFamily): string {
	return FONT_CSS[family] ?? FONT_CSS.Helvetica;
}

/** The standard PDF font a family is written with (appearance stream, /DA, /DS). */
export function standardFontOf(family: FreeTextFontFamily): 'Helvetica' | 'Times' | 'Courier' {
	return family === 'Times' || family === 'Courier' ? family : 'Helvetica';
}
