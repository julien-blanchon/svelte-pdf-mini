import type { PaletteColor } from '../../core/annotations/colors.js';
import { rgbToCss } from '../../core/annotations/colors.js';
import type { Annotation } from '../../core/annotations/model.js';

/** CSS colour of an annotation for the current page theme (palette entries have a dark variant). */
export function annotationCss(a: Annotation, palette: PaletteColor[], dark: boolean): string {
	const p = a.paletteKey ? palette.find((c) => c.key === a.paletteKey) : undefined;
	if (p) return dark ? p.dark : p.light;
	return rgbToCss(a.color);
}
