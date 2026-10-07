import { pageThemes, paperHex, type PageThemeStrategy } from 'svelte-pdf-mini';

export type PageFrame = 'shadow' | 'border' | 'rounded' | 'flat' | 'none';

/**
 * The reading theme used across the demo apps: `pageThemes.paper` (soft tint by day,
 * tinted vector recolor by night), a colour, a strength and a page frame.
 */
export class ReadingTheme {
	dark = $state(false);
	color = $state('warm');
	strength = $state(0.5);
	frame = $state<PageFrame>('shadow');

	constructor(init: Partial<Pick<ReadingTheme, 'dark' | 'color' | 'strength' | 'frame'>> = {}) {
		Object.assign(this, init);
	}

	readonly strategy: PageThemeStrategy = $derived(
		this.color === 'white' && !this.dark ? pageThemes.none() : pageThemes.paper({ color: paperHex(this.color, this.dark), dark: this.dark, strength: this.strength })
	);
	/** CSS colour of a page (for UI that should match it). */
	readonly swatch = $derived(this.strategy.background ?? '#ffffff');
}
