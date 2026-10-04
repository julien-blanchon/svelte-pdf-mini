import { expect, test, type Locator, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

// WAI-ARIA keyboard navigation: one tab stop per list / tree, arrows move focus,
// Home / End jump, Enter activates; in trees Right / Left open, close and move
// between parent and child. Selectors are roles / data attributes (labels are i18n).

/** The page whose box holds the viewport's top edge. */
const currentPage = (page: Page) =>
	page.locator('[data-pdf-viewport]').evaluate((vp) => {
		const top = vp.getBoundingClientRect().top + 40;
		const pages = [...vp.querySelectorAll<HTMLElement>('[data-pdf-page]')];
		const hit = pages.find((p) => {
			const r = p.getBoundingClientRect();
			return r.top <= top && r.bottom > top;
		});
		return Number(hit?.dataset.pdfPage ?? 0);
	});

/** Presses Tab until focus lands inside `container` (at most `max` times). */
async function tabInto(page: Page, container: Locator, max = 15) {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		if (await container.evaluate((el) => el.contains(document.activeElement))) return;
	}
	throw new Error('Tab never reached the container');
}

/** Pins the first match of `selector` with a test id (state-based selectors re-resolve after toggling). */
async function pin(scope: Locator, selector: string, id: string) {
	await scope.locator(selector).first().evaluate((el, id) => el.setAttribute('data-test', id), id);
	return scope.locator(`[data-test="${id}"]`);
}

/** Index of the focused element among `items`, or -1. */
const focusedIndex = (items: Locator) =>
	items.evaluateAll((els) => els.indexOf(document.activeElement as HTMLElement));

test('outline tree: one tab stop, arrows, Right / Left open and close, Enter navigates @smoke', async ({ page }) => {
	await page.goto('/demo/outline-thumbnails');
	await ready(page);
	await page.getByRole('tab').nth(0).click();
	const tree = page.locator('[data-pdf-outline-tree]');
	const items = tree.locator('[data-pdf-outline-item]');
	await expect(items.first()).toBeVisible();

	// Exactly one tab stop; Tab enters on it, the next Tab leaves the tree.
	await expect(tree.locator('[tabindex="0"]')).toHaveCount(1);
	await tabInto(page, tree);
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('Tab');
	expect(await tree.evaluate((el) => el.contains(document.activeElement))).toBe(false);
	await page.keyboard.press('Shift+Tab');
	await expect(items.first()).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(items.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('ArrowUp'); // no wrap
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('End');
	await expect(items.last()).toBeFocused();
	await page.keyboard.press('Home');
	await expect(items.first()).toBeFocused();

	// The first open top-level branch.
	const branch = await pin(tree, '[role=treeitem][aria-level="1"][aria-expanded=true]', 'branch');
	const branchItem = branch.locator('[data-pdf-outline-item]').first();
	const firstChild = branch.locator('[role=treeitem]').first();
	const branchIndex = await items.evaluateAll(
		(els, target) => els.findIndex((e) => e.closest('[role=treeitem]') === target),
		await branch.elementHandle()
	);
	expect(branchIndex).toBeGreaterThanOrEqual(0);
	for (let i = 0; i < branchIndex; i++) await page.keyboard.press('ArrowDown');
	await expect(branchItem).toBeFocused();

	// Right on an open branch: to its first child; Left: back to the parent.
	await page.keyboard.press('ArrowRight');
	await expect(firstChild.locator('[data-pdf-outline-item]').first()).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(branchItem).toBeFocused();
	// Left on an open branch closes it (focus stays); Right opens it again.
	await page.keyboard.press('ArrowLeft');
	await expect(branch).toHaveAttribute('aria-expanded', 'false');
	await expect(branch.locator('[role=group]')).toHaveCount(0);
	await expect(branchItem).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(branch).toHaveAttribute('aria-expanded', 'true');
	await expect(branchItem).toBeFocused();

	// Arrowing moved the tab stop along.
	await expect(tree.locator('[tabindex="0"]')).toHaveCount(1);
	await expect(branchItem).toHaveAttribute('tabindex', '0');

	// Enter goes to the section.
	expect(await currentPage(page)).toBe(1);
	await page.keyboard.press('Enter');
	await expect.poll(() => currentPage(page)).toBeGreaterThan(1);
});

test('outline tree: Right opens a closed nested branch, Left from a child returns to it', async ({ page }) => {
	await page.goto('/demo/outline-thumbnails');
	await ready(page);
	await page.getByRole('tab').nth(0).click();
	const tree = page.locator('[data-pdf-outline-tree]');
	const items = tree.locator('[data-pdf-outline-item]');
	await expect(items.first()).toBeVisible();

	const closed = await pin(tree, '[role=treeitem][aria-level="2"][aria-expanded=false]', 'closed');
	const closedItem = closed.locator('[data-pdf-outline-item]').first();
	await closedItem.focus();
	await page.keyboard.press('ArrowRight');
	await expect(closed).toHaveAttribute('aria-expanded', 'true');
	await expect(closedItem).toBeFocused();
	await page.keyboard.press('ArrowRight');
	const child = closed.locator('[role=group] [data-pdf-outline-item]').first();
	await expect(child).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(closedItem).toBeFocused();
	// Left on the open branch closes it, then moves to its parent.
	await page.keyboard.press('ArrowLeft');
	await expect(closed).toHaveAttribute('aria-expanded', 'false');
	await page.keyboard.press('ArrowLeft');
	const parent = closed.locator('xpath=ancestor::li[@role="treeitem"][1]');
	await expect(parent.locator('[data-pdf-outline-item]').first()).toBeFocused();
});

test('thumbnails: one tab stop, arrows move focus, Enter goes to the page', async ({ page }) => {
	await page.goto('/demo/outline-thumbnails');
	await ready(page);
	await page.getByRole('tab').nth(3).click();
	const list = page.locator('[data-pdf-thumbnails]');
	const thumbs = list.locator('[data-pdf-thumbnail]');
	await expect(thumbs.first()).toBeVisible();
	await expect(list).toHaveAttribute('role', 'listbox');

	await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
	await tabInto(page, list);
	await expect(thumbs.first()).toBeFocused();
	await expect(thumbs.first()).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowDown');
	await expect(thumbs.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(thumbs.nth(2)).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(thumbs.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(thumbs.first()).toBeFocused();
	await page.keyboard.press('ArrowUp'); // no wrap
	await expect(thumbs.first()).toBeFocused();
	await page.keyboard.press('End');
	await expect(thumbs.last()).toBeFocused();
	await page.keyboard.press('Home');
	await expect(thumbs.first()).toBeFocused();
	// Moving focus does not change the page.
	expect(await currentPage(page)).toBe(1);

	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
	await expect(thumbs.nth(3)).toBeFocused();
	await page.keyboard.press('Enter');
	await expect.poll(() => currentPage(page)).toBe(4);
	await expect(thumbs.nth(3)).toHaveAttribute('aria-selected', 'true');
	// The current page is now the tab stop.
	await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
	await expect(thumbs.nth(3)).toHaveAttribute('tabindex', '0');
});

test('toc tree: one tab stop, arrows, Right to the first child, Left to the parent', async ({ page }) => {
	await page.goto('/demo/toc-views');
	await ready(page);
	const nav = page.locator('[data-pdf-toc=tree]');
	const items = nav.locator('[data-pdf-toc-item]');
	await expect(items.nth(3)).toBeVisible({ timeout: 30_000 });
	await expect(nav.getByRole('tree')).toHaveCount(1);
	await expect(nav.locator('[tabindex="0"]')).toHaveCount(1);

	const tabStop = nav.locator('[tabindex="0"]');
	await tabStop.focus();
	const start = await focusedIndex(items);
	expect(start).toBeGreaterThanOrEqual(0);
	await page.keyboard.press('Home');
	await expect(items.first()).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(items.nth(1)).toBeFocused();
	await page.keyboard.press('End');
	await expect(items.last()).toBeFocused();
	await page.keyboard.press('Home');

	// The first top-level section with subsections.
	const branch = nav.locator('[role=treeitem][aria-level="1"]:has([role=group])').first();
	const branchItem = branch.locator('[data-pdf-toc-item]').first();
	await branchItem.focus();
	await page.keyboard.press('ArrowRight');
	const child = branch.locator('[role=group] [data-pdf-toc-item]').first();
	await expect(child).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(branchItem).toBeFocused();
	// A top-level section has no parent: Left does nothing.
	await page.keyboard.press('ArrowLeft');
	await expect(branchItem).toBeFocused();

	// A leaf: Right does nothing.
	const leaf = nav.locator('[role=treeitem]:not(:has([role=group])) [data-pdf-toc-item]').first();
	await leaf.focus();
	await page.keyboard.press('ArrowRight');
	await expect(leaf).toBeFocused();
	await expect(nav.locator('[tabindex="0"]')).toHaveCount(1);
	await expect(leaf).toHaveAttribute('tabindex', '0');
});

test('annotation hotspots: one tab stop per page, arrows cycle, Enter selects', async ({ page }) => {
	await page.goto('/demo/annotations-readonly');
	await ready(page);
	const layer = page.locator('[data-pdf-page="1"] [data-pdf-annotation-overlay]');
	const spots = layer.locator('[data-pdf-annotation-focus]');
	await expect(spots).toHaveCount(2);
	await expect(layer.locator('[data-pdf-annotation-focus][tabindex="0"]')).toHaveCount(1);

	await spots.first().focus();
	await page.keyboard.press('ArrowDown');
	await expect(spots.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowDown'); // wraps
	await expect(spots.first()).toBeFocused();
	await page.keyboard.press('End');
	await expect(spots.nth(1)).toBeFocused();
	await expect(spots.nth(1)).toHaveAttribute('tabindex', '0');

	// The second one (lower on the page) is the foreign, read-only one.
	await page.keyboard.press('Enter');
	await expect(spots.nth(1)).toHaveAttribute('aria-pressed', 'true');
	// Selected but read-only: nothing to nudge, so arrows still move focus.
	await page.keyboard.press('ArrowUp');
	await expect(spots.first()).toBeFocused();
	// Selected and editable: arrows nudge it instead.
	await page.keyboard.press('Enter');
	await expect(spots.first()).toHaveAttribute('aria-pressed', 'true');
	const before = await spots.first().boundingBox();
	await page.keyboard.press('Shift+ArrowDown');
	await expect(spots.first()).toBeFocused();
	await expect.poll(async () => (await spots.first().boundingBox())!.y).toBeGreaterThan(before!.y);
});
