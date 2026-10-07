import { describe, expect, it } from 'vitest';
import { inkCss } from '../view/theme.js';
import { defaultPalette, paletteInk } from './colors.js';

describe('palette ink', () => {
	it('derives a text shade from the light and dark fills', () => {
		const yellow = defaultPalette[0];
		expect(paletteInk(yellow)).toBe(inkCss(yellow.light));
		expect(paletteInk(yellow, true)).toBe(inkCss(yellow.dark, true));
	});

	it('prefers explicit ink values', () => {
		const custom = { ...defaultPalette[0], ink: '#5c4a00', inkDark: '#ffe08a' };
		expect(paletteInk(custom)).toBe('#5c4a00');
		expect(paletteInk(custom, true)).toBe('#ffe08a');
	});
});
