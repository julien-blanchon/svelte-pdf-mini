import { describe, expect, it } from 'vitest';
import {
	invertLightness,
	mixHex,
	pageThemes,
	paperColors,
	paperTheme,
	resolvePageTheme
} from './theme.js';

describe('page themes', () => {
	it('resolves names and objects', () => {
		expect(resolvePageTheme(undefined).id).toBe('none');
		expect(resolvePageTheme('invert').filter).toContain('invert(1)');
		const custom = { id: 'x', filter: 'blur(1px)' };
		expect(resolvePageTheme(custom)).toBe(custom);
	});

	it('distinguishes CSS-only and render strategies', () => {
		expect(pageThemes.dim().pageColors).toBeUndefined();
		expect(pageThemes.recolor().pageColors).toEqual({
			background: '#1e1e1e',
			foreground: '#e6e6e6'
		});
		expect(pageThemes.invert().id).not.toBe(pageThemes.invert({ saturate: 2 }).id);
	});
});

describe('paper theme', () => {
	it('is a soft multiply tint in light mode and a recolor at night', () => {
		const light = pageThemes.paper({ color: '#e6eddc' });
		expect(light.blend).toBe('multiply');
		expect(light.background).toMatch(/^#/);
		const dark = pageThemes.paper({ color: '#7fa36a', dark: true });
		expect(dark.dark).toBe(true);
		expect(dark.wrapContext).toBeTypeOf('function');
		expect(paperTheme(paperColors[0], true).id).toContain('paperDark');
	});

	it('mixes colors and recolors ink', () => {
		expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(invertLightness('#ffffff', [0.1, 0.9], { background: '#141414' })).toBe('#141414');
		expect(invertLightness('#000000', [0.1, 0.9])).toMatch(/^hsl\(.* 90\.0% \/ 1\)$/);
	});
});
