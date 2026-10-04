/** Per-instance CSS custom properties, e.g. `{ '--pdf-focus-left': '12%' }`. */
export type CssVars = Record<`--${string}`, string | number | null | undefined>;

/**
 * `style` string for a part's props (merged by `mergeProps`): per-instance values
 * only, as custom properties; the layout rules using them live in the component's
 * `<style>` block. Nullish values are skipped.
 */
export function cssVars(vars: CssVars): string {
	let style = '';
	for (const [name, value] of Object.entries(vars)) if (value != null) style += `${name}:${value};`;
	return style;
}
