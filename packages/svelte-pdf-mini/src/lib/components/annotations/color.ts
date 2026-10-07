import type { PaletteColor } from '../../core/annotations/colors.js';
import { paletteInk, rgbToCss } from '../../core/annotations/colors.js';
import { inkCss } from '../../core/view/theme.js';
import type { Annotation } from '../../core/annotations/model.js';

/** CSS color of an annotation for the current page theme (palette entries have a dark variant). */
export function annotationCss(a: Annotation, palette: PaletteColor[], dark: boolean): string {
	const p = a.paletteKey ? palette.find((c) => c.key === a.paletteKey) : undefined;
	if (p) return dark ? p.dark : p.light;
	return rgbToCss(a.color);
}

/** Text color of an annotation (text boxes): the ink shade of its color for the page theme. */
export function annotationInk(a: Annotation, palette: PaletteColor[], dark: boolean): string {
	const p = a.paletteKey ? palette.find((c) => c.key === a.paletteKey) : undefined;
	return p ? paletteInk(p, dark) : inkCss(rgbToCss(a.color), dark);
}
