import { describe, expect, it, vi } from 'vitest';
import { handleRovingKey, isActivationKey, rovingTarget } from './roving.js';

/** Just enough of a KeyboardEvent for the helpers. */
function fakeKey(key: string) {
	return {
		key,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	};
}
const asEvent = (e: ReturnType<typeof fakeKey>) => e as unknown as KeyboardEvent;

describe('rovingTarget', () => {
	it('moves with Up / Down when vertical (the default)', () => {
		expect(rovingTarget('ArrowDown', 1, 4)).toBe(2);
		expect(rovingTarget('ArrowUp', 1, 4)).toBe(0);
		expect(rovingTarget('ArrowRight', 1, 4)).toBeNull();
		expect(rovingTarget('ArrowLeft', 1, 4)).toBeNull();
	});

	it('moves with Left / Right when horizontal', () => {
		const opts = { orientation: 'horizontal' } as const;
		expect(rovingTarget('ArrowRight', 1, 4, opts)).toBe(2);
		expect(rovingTarget('ArrowLeft', 1, 4, opts)).toBe(0);
		expect(rovingTarget('ArrowDown', 1, 4, opts)).toBeNull();
		expect(rovingTarget('ArrowUp', 1, 4, opts)).toBeNull();
	});

	it('moves with every arrow when both', () => {
		const opts = { orientation: 'both' } as const;
		expect(rovingTarget('ArrowRight', 1, 4, opts)).toBe(2);
		expect(rovingTarget('ArrowDown', 1, 4, opts)).toBe(2);
		expect(rovingTarget('ArrowLeft', 1, 4, opts)).toBe(0);
		expect(rovingTarget('ArrowUp', 1, 4, opts)).toBe(0);
	});

	it('wraps around by default', () => {
		expect(rovingTarget('ArrowDown', 3, 4)).toBe(0);
		expect(rovingTarget('ArrowUp', 0, 4)).toBe(3);
	});

	it('clamps at the ends without loop', () => {
		expect(rovingTarget('ArrowDown', 3, 4, { loop: false })).toBe(3);
		expect(rovingTarget('ArrowUp', 0, 4, { loop: false })).toBe(0);
		expect(rovingTarget('ArrowDown', 1, 4, { loop: false })).toBe(2);
	});

	it('jumps with Home / End whatever the orientation', () => {
		for (const orientation of ['vertical', 'horizontal', 'both'] as const) {
			expect(rovingTarget('Home', 2, 5, { orientation })).toBe(0);
			expect(rovingTarget('End', 2, 5, { orientation })).toBe(4);
		}
	});

	it('ignores other keys', () => {
		for (const key of ['Enter', ' ', 'a', 'Tab', 'PageDown', 'Escape']) {
			expect(rovingTarget(key, 1, 4)).toBeNull();
		}
	});

	it('does nothing on an empty list', () => {
		for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
			expect(rovingTarget(key, 0, 0)).toBeNull();
		}
	});

	it('stays put on a single item', () => {
		expect(rovingTarget('ArrowDown', 0, 1)).toBe(0);
		expect(rovingTarget('ArrowUp', 0, 1, { loop: false })).toBe(0);
	});
});

describe('isActivationKey', () => {
	it('is Enter or Space', () => {
		expect(isActivationKey(asEvent(fakeKey('Enter')))).toBe(true);
		expect(isActivationKey(asEvent(fakeKey(' ')))).toBe(true);
		expect(isActivationKey(asEvent(fakeKey('a')))).toBe(false);
	});
});

describe('handleRovingKey', () => {
	it('focuses the target and stops the event on an arrow', () => {
		const e = fakeKey('ArrowDown');
		const focus = vi.fn();
		const activate = vi.fn();
		expect(handleRovingKey(asEvent(e), 0, 3, { focus, activate })).toBe(true);
		expect(focus).toHaveBeenCalledWith(1);
		expect(activate).not.toHaveBeenCalled();
		expect(e.preventDefault).toHaveBeenCalledOnce();
		expect(e.stopPropagation).toHaveBeenCalledOnce();
	});

	it('passes orientation and loop through', () => {
		const focus = vi.fn();
		const opts = { focus, orientation: 'horizontal', loop: false } as const;
		expect(handleRovingKey(asEvent(fakeKey('ArrowRight')), 2, 3, opts)).toBe(true);
		expect(focus).toHaveBeenLastCalledWith(2);
		expect(handleRovingKey(asEvent(fakeKey('ArrowDown')), 1, 3, opts)).toBe(false);
		expect(focus).toHaveBeenCalledTimes(1);
	});

	it.each(['Enter', ' '])('activates on %j', (key) => {
		const e = fakeKey(key);
		const focus = vi.fn();
		const activate = vi.fn();
		expect(handleRovingKey(asEvent(e), 1, 3, { focus, activate })).toBe(true);
		expect(activate).toHaveBeenCalledOnce();
		expect(focus).not.toHaveBeenCalled();
		expect(e.preventDefault).toHaveBeenCalledOnce();
		expect(e.stopPropagation).toHaveBeenCalledOnce();
	});

	it('leaves Enter alone without an activate callback', () => {
		const e = fakeKey('Enter');
		const focus = vi.fn();
		expect(handleRovingKey(asEvent(e), 1, 3, { focus })).toBe(false);
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(e.stopPropagation).not.toHaveBeenCalled();
	});

	it('leaves unhandled keys alone', () => {
		const e = fakeKey('a');
		const focus = vi.fn();
		const activate = vi.fn();
		expect(handleRovingKey(asEvent(e), 1, 3, { focus, activate })).toBe(false);
		expect(focus).not.toHaveBeenCalled();
		expect(activate).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(e.stopPropagation).not.toHaveBeenCalled();
	});

	it('does not move on an empty list', () => {
		const e = fakeKey('Home');
		const focus = vi.fn();
		expect(handleRovingKey(asEvent(e), 0, 0, { focus })).toBe(false);
		expect(focus).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});
});
