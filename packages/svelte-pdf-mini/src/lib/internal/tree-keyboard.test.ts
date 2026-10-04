import { describe, expect, it, vi } from 'vitest';
import { handleTreeKey, shownTree, treeTabStop, type TreeKeyModel } from './tree-keyboard.js';

interface Node {
	id: string;
	children: Node[];
}
const node = (id: string, ...children: Node[]): Node => ({ id, children });

/*
 * a
 * ├─ a1
 * │  └─ a1x
 * └─ a2
 * b
 * c
 * └─ c1
 */
const a1x = node('a1x');
const a1 = node('a1', a1x);
const a2 = node('a2');
const a = node('a', a1, a2);
const b = node('b');
const c1 = node('c1');
const c = node('c', c1);
const roots = [a, b, c];

const ids = (items: Node[]) => items.map((n) => n.id);

function fakeKey(
	key: string,
	mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}
) {
	return {
		key,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		...mods,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn()
	};
}

/** A model over `roots` whose open set is mutable, re-flattened on each call. */
function model(open: Set<Node>, toggleable = true) {
	const build = (): TreeKeyModel<Node> => ({
		tree: shownTree(roots, (item) => open.has(item)),
		isBranch: (item) => item.children.length > 0,
		isOpen: (item) => open.has(item),
		setOpen: toggleable
			? (item, isOpen) => void (isOpen ? open.add(item) : open.delete(item))
			: undefined
	});
	return build;
}

/** Presses `key` on `item`; returns the focused item id (or null when unhandled). */
function press(build: () => TreeKeyModel<Node>, item: Node, key: string) {
	const m = build();
	const e = fakeKey(key);
	let focused: number | null = null;
	const handled = handleTreeKey(e as unknown as KeyboardEvent, item, m, (i) => (focused = i));
	// Focus indices refer to the tree as it was when the key was handled.
	const target = focused === null ? null : m.tree.items[focused].id;
	expect(handled).toBe(target !== null);
	expect(e.preventDefault).toHaveBeenCalledTimes(handled ? 1 : 0);
	expect(e.stopPropagation).toHaveBeenCalledTimes(handled ? 1 : 0);
	return target;
}

describe('shownTree', () => {
	it('lists only the roots when everything is closed', () => {
		const { items, parents } = shownTree(roots, () => false);
		expect(ids(items)).toEqual(['a', 'b', 'c']);
		expect(parents.get(a)).toBeNull();
		expect(parents.has(a1)).toBe(false);
	});

	it('flattens open branches depth-first with their parents', () => {
		const { items, parents } = shownTree(roots, () => true);
		expect(ids(items)).toEqual(['a', 'a1', 'a1x', 'a2', 'b', 'c', 'c1']);
		expect(parents.get(a1x)).toBe(a1);
		expect(parents.get(a2)).toBe(a);
		expect(parents.get(c1)).toBe(c);
	});

	it('passes the depth (from 1) to isOpen', () => {
		const isOpen = vi.fn((_item: Node, depth: number) => depth < 2);
		const { items } = shownTree(roots, isOpen);
		expect(ids(items)).toEqual(['a', 'a1', 'a2', 'b', 'c', 'c1']);
		expect(isOpen).toHaveBeenCalledWith(a, 1);
		expect(isOpen).toHaveBeenCalledWith(a1, 2);
		// Leaves are never asked.
		expect(isOpen).not.toHaveBeenCalledWith(b, expect.anything());
	});
});

describe('treeTabStop', () => {
	const tree = shownTree(roots, (item) => item === a);

	it('keeps the last focused item while it is shown', () => {
		expect(treeTabStop(tree, a2, [c])).toBe(a2);
	});

	it('falls back to the deepest shown item of the active path', () => {
		expect(treeTabStop(tree, a1x, [a, a1, a1x])).toBe(a1);
		expect(treeTabStop(tree, null, [c, c1])).toBe(c);
	});

	it('falls back to the first item', () => {
		expect(treeTabStop(tree, null, [])).toBe(a);
	});

	it('is null on an empty tree', () => {
		expect(
			treeTabStop(
				shownTree<Node>([], () => true),
				null,
				[]
			)
		).toBeNull();
	});
});

describe('handleTreeKey', () => {
	it('moves Up / Down / Home / End over shown items without wrapping', () => {
		const build = model(new Set([a]));
		expect(press(build, a, 'ArrowDown')).toBe('a1');
		expect(press(build, a1, 'ArrowDown')).toBe('a2');
		expect(press(build, a2, 'ArrowUp')).toBe('a1');
		expect(press(build, a, 'ArrowUp')).toBe('a');
		expect(press(build, c, 'ArrowDown')).toBe('c');
		expect(press(build, a1, 'Home')).toBe('a');
		expect(press(build, a, 'End')).toBe('c');
	});

	it('Right opens a closed branch and keeps focus on it', () => {
		const open = new Set<Node>();
		const build = model(open);
		expect(press(build, a, 'ArrowRight')).toBe('a');
		expect(open.has(a)).toBe(true);
		expect(ids(build().tree.items)).toEqual(['a', 'a1', 'a2', 'b', 'c']);
	});

	it('Right on an open branch moves to its first child', () => {
		const open = new Set([a]);
		const build = model(open);
		expect(press(build, a, 'ArrowRight')).toBe('a1');
		expect(open.has(a)).toBe(true);
	});

	it('Right on a leaf does nothing', () => {
		const build = model(new Set([a]));
		expect(press(build, a2, 'ArrowRight')).toBeNull();
		expect(press(build, b, 'ArrowRight')).toBeNull();
	});

	it('Left closes an open branch and keeps focus on it', () => {
		const open = new Set([a, a1]);
		const build = model(open);
		expect(press(build, a1, 'ArrowLeft')).toBe('a1');
		expect(open.has(a1)).toBe(false);
		expect(open.has(a)).toBe(true);
	});

	it('Left on a child (or closed branch) moves to its parent', () => {
		const build = model(new Set([a, a1]));
		expect(press(build, a1x, 'ArrowLeft')).toBe('a1');
		expect(press(build, a2, 'ArrowLeft')).toBe('a');
		expect(press(model(new Set([a])), a1, 'ArrowLeft')).toBe('a');
	});

	it('Left on a root that is closed does nothing', () => {
		const build = model(new Set());
		expect(press(build, b, 'ArrowLeft')).toBeNull();
		expect(press(build, a, 'ArrowLeft')).toBeNull();
	});

	it('without setOpen, Right only moves into open branches and Left only to parents', () => {
		const open = new Set([a]);
		const build = model(open, false);
		expect(press(build, c, 'ArrowRight')).toBeNull();
		expect(press(build, a, 'ArrowRight')).toBe('a1');
		expect(press(build, a, 'ArrowLeft')).toBeNull();
		expect(press(build, a1, 'ArrowLeft')).toBe('a');
		expect(open).toEqual(new Set([a]));
	});

	it('leaves Enter, Space, other keys and modified keys alone', () => {
		const build = model(new Set([a]));
		for (const key of ['Enter', ' ', 'a', 'Tab']) expect(press(build, a, key)).toBeNull();
		for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
			const e = fakeKey('ArrowDown', { [mod]: true });
			const focus = vi.fn();
			expect(handleTreeKey(e as unknown as KeyboardEvent, a, build(), focus)).toBe(false);
			expect(focus).not.toHaveBeenCalled();
			expect(e.preventDefault).not.toHaveBeenCalled();
		}
	});

	it('ignores an item that is not shown', () => {
		const build = model(new Set());
		expect(press(build, a1x, 'ArrowLeft')).toBeNull();
	});
});
