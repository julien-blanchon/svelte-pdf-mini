import { describe, expect, it } from 'vitest';
import { defaultKeymap, matchAction, matchesCombo } from './keymap.js';

const key = (k: string, init: Partial<KeyboardEventInit & { code: string }> = {}) =>
	({
		key: k,
		code: init.code ?? '',
		ctrlKey: !!init.ctrlKey,
		metaKey: !!init.metaKey,
		altKey: !!init.altKey,
		shiftKey: !!init.shiftKey
	}) as KeyboardEvent;

const MOD =
	typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
		? { metaKey: true }
		: { ctrlKey: true };

describe('keymap', () => {
	it('matches plain keys, mod and shift combos', () => {
		expect(matchesCombo(key('h'), 'h')).toBe(true);
		expect(matchesCombo(key('H', { shiftKey: true }), 'h')).toBe(false);
		expect(matchesCombo(key('z', MOD), 'mod+z')).toBe(true);
		expect(matchesCombo(key('z', { ...MOD, shiftKey: true }), 'shift+mod+z')).toBe(true);
		expect(matchesCombo(key('z', { ...MOD, shiftKey: true }), 'mod+z')).toBe(false);
	});

	it('reads Alt+digit from the key code (macOS types a symbol)', () => {
		expect(matchesCombo(key('¡', { altKey: true, code: 'Digit1' }), 'alt+1')).toBe(true);
	});

	it('resolves actions in priority order', () => {
		expect(matchAction(key('Enter'), defaultKeymap, ['confirm', 'edit'])).toBe('confirm');
		expect(matchAction(key('x'), defaultKeymap, ['confirm', 'edit'])).toBeNull();
	});
});
