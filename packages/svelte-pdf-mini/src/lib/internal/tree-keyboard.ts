/**
 * Keyboard support for tree views (WAI-ARIA "tree" pattern), shared by
 * Outline.Tree and Toc.Tree: Up / Down / Home / End move between the shown
 * items (via the roving helper), Right opens a branch or moves to its first
 * child, Left closes it or moves to the parent.
 */
import { rovingTarget } from './roving.js';

interface TreeNode<T> {
	children: readonly T[];
}

/** A tree flattened to what is on screen. */
export interface ShownTree<T> {
	/** Shown items in display order (closed branches left out). */
	items: T[];
	parents: Map<T, T | null>;
}

/** Flattens the items `isOpen` lets through, depth-first. `depth` starts at 1. */
export function shownTree<T extends TreeNode<T>>(
	roots: readonly T[],
	isOpen: (item: T, depth: number) => boolean
): ShownTree<T> {
	const items: T[] = [];
	const parents = new Map<T, T | null>();
	const walk = (list: readonly T[], parent: T | null, depth: number) => {
		for (const item of list) {
			items.push(item);
			parents.set(item, parent);
			if (item.children.length && isOpen(item, depth)) walk(item.children, item, depth + 1);
		}
	};
	walk(roots, null, 1);
	return { items, parents };
}

/** What a tree view tells the keyboard handler about an item. */
export interface TreeKeyModel<T> {
	tree: ShownTree<T>;
	/** Has children that can be shown. */
	isBranch: (item: T) => boolean;
	isOpen: (item: T) => boolean;
	/** Opens / closes a branch. Omit for trees that are always open. */
	setOpen?: (item: T, open: boolean) => void;
}

/** Right / Left: the item to focus next (the same one when the key only toggled), or null. */
const BRANCH_KEYS: Partial<Record<string, <T>(item: T, model: TreeKeyModel<T>) => T | null>> = {
	ArrowRight(item, { tree, isBranch, isOpen, setOpen }) {
		if (!isBranch(item)) return null;
		// An open branch's first child is the next shown item.
		if (isOpen(item)) return tree.items[tree.items.indexOf(item) + 1] ?? null;
		if (!setOpen) return null;
		setOpen(item, true);
		return item;
	},
	ArrowLeft(item, { tree, isBranch, isOpen, setOpen }) {
		if (setOpen && isBranch(item) && isOpen(item)) {
			setOpen(item, false);
			return item;
		}
		return tree.parents.get(item) ?? null;
	}
};

/** Index (in `model.tree.items`) the key moves focus to, or null when it does nothing. */
function treeTarget<T>(key: string, item: T, model: TreeKeyModel<T>): number | null {
	const { items } = model.tree;
	const moved = rovingTarget(key, items.indexOf(item), items.length, { loop: false });
	if (moved !== null) return moved;
	const target = BRANCH_KEYS[key]?.(item, model);
	return target == null ? null : items.indexOf(target);
}

/**
 * Handles a keydown on a tree item: calls `focus(index)` with the index of the
 * item to focus. Returns true when it handled the key (the event is then
 * prevented and stopped). Enter / Space are left to the item's button.
 */
export function handleTreeKey<T>(
	e: KeyboardEvent,
	item: T,
	model: TreeKeyModel<T>,
	focus: (index: number) => void
): boolean {
	if (e.altKey || e.ctrlKey || e.metaKey) return false;
	const next = treeTarget(e.key, item, model);
	if (next === null || next < 0) return false;
	focus(next);
	e.preventDefault();
	e.stopPropagation();
	return true;
}

/**
 * The single tab stop of a roving tree: the last focused item while shown,
 * else the deepest shown item of `activePath`, else the first item.
 */
export function treeTabStop<T>(
	tree: ShownTree<T>,
	focused: T | null,
	activePath: readonly T[]
): T | null {
	if (focused && tree.parents.has(focused)) return focused;
	return activePath.findLast((item) => tree.parents.has(item)) ?? tree.items[0] ?? null;
}

/**
 * The tree items rendered under `root` (`[role=treeitem]`, in display order)
 * and the index of the one holding `target`.
 */
export function treeItemsAround(
	root: HTMLElement,
	target: EventTarget | null
): { elements: HTMLElement[]; index: number } {
	const elements = [...root.querySelectorAll<HTMLElement>('[role=treeitem]')];
	const owner = target instanceof Element ? target.closest<HTMLElement>('[role=treeitem]') : null;
	return { elements, index: owner ? elements.indexOf(owner) : -1 };
}
