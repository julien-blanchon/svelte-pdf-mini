import { expect, test } from '@playwright/test';
import { noErrors, ready, rendered, selectText } from './helpers.ts';

// ── from annotations-r3 ──

test('pending note: digits recolour before typing, Markdown + maths render, Backspace discards a pristine one', async ({ page }) => {
	await page.goto('/demo/annotations-markup');
	await ready(page);
	await selectText(page, { min: 300, max: 800 });
	await page.locator('[data-pdf-selection-menu] [data-color=yellow]').click();
	await page.keyboard.press('2');
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveAttribute('data-color', 'green');
	await page.keyboard.type('**Key** $x^2$ 3');
	await expect(page.locator('[data-pdf-annotation-popover] textarea')).toHaveValue('**Key** $x^2$ 3');
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-pdf-margin-note] strong')).toHaveText('Key');
	await expect(page.locator('[data-pdf-margin-note] .katex').first()).toBeAttached();
	await selectText(page, { min: 300, max: 800, skip: 4 });
	await page.locator('[data-pdf-selection-menu] [data-color=blue]').click();
	await page.keyboard.press('Backspace');
	await expect(page.locator('[data-pdf-annotation]')).toHaveCount(1);
});

test('overlapping boxes: innermost first, clicking again cycles; moving keeps the selection', async ({ page }) => {
	await page.goto('/demo/annotations-draw');
	await ready(page);
	await expect(page.locator('[data-pdf-page="3"] [data-pdf-canvas][data-rendered]')).toBeAttached();
	await page.waitForTimeout(500);
	const pg = (await page.locator('[data-pdf-page="3"]').boundingBox())!;
	const top = Math.max(pg.y, 160);
	const draw = async (x1: number, y1: number, x2: number, y2: number) => {
		await page.locator('[data-pdf-annotation-tool=area]').click();
		await page.mouse.move(pg.x + x1, top + y1);
		await page.mouse.down();
		await page.mouse.move(pg.x + x2, top + y2, { steps: 6 });
		await page.mouse.up();
		await page.keyboard.press('Enter');
	};
	await draw(100, 20, 700, 380);
	await draw(250, 100, 500, 280);
	const at = { x: pg.x + 375, y: top + 190 };
	await page.mouse.click(at.x, at.y);
	const first = await page.locator('[data-pdf-annotation][data-selected]').getAttribute('data-pdf-annotation');
	await page.mouse.click(at.x, at.y);
	await expect(page.locator('[data-pdf-annotation][data-selected]')).not.toHaveAttribute('data-pdf-annotation', first!);
	const body = (await page.locator('[data-pdf-annotation-handles] [data-part=body]').boundingBox())!;
	await page.mouse.move(body.x + 20, body.y + 20);
	await page.mouse.down();
	await page.mouse.move(body.x + 80, body.y + 60, { steps: 6 });
	await expect(page.locator('[data-pdf-annotation-handles]')).toHaveCount(1);
	await page.mouse.up();
	await expect(page.locator('[data-pdf-annotation][data-selected]')).toHaveCount(1);
	await expect(page.locator('[data-pdf-annotation-handles] [data-part=handle]')).toHaveCount(8);
});

test('text boxes are typed on the page; the pen draws freehand strokes', async ({ page }) => {
	await page.goto('/demo/annotations-draw');
	await ready(page);
	await expect(page.locator('[data-pdf-page="3"] [data-pdf-canvas][data-rendered]')).toBeAttached();
	await page.waitForTimeout(500);
	const pg = (await page.locator('[data-pdf-page="3"]').boundingBox())!;
	await page.locator('[data-pdf-annotation-tool=freetext]').click();
	await page.mouse.click(pg.x + 150, Math.max(pg.y, 160) + 300);
	await expect(page.locator('[data-pdf-annotation-freetext] textarea')).toBeFocused();
	await page.keyboard.type('Hello box');
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-pdf-annotation-freetext]')).toHaveText('Hello box');
	await page.locator('[data-pdf-annotation-tool=ink]').click();
	const x = pg.x + 500;
	const y = Math.max(pg.y, 160) + 180;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let k = 0; k < 20; k++) await page.mouse.move(x + k * 6, y + Math.sin(k / 3) * 20);
	await page.mouse.up();
	await expect(page.locator('[data-pdf-annotation][data-kind=ink] path[fill]:not([fill=none])')).toHaveCount(1);
});

test('annotations are reachable with the keyboard', async ({ page }) => {
	await page.goto('/demo/annotations-readonly');
	await ready(page);
	await page.locator('[data-pdf-viewport]').focus();
	await page.keyboard.press('Tab');
	await expect(page.locator(':focus')).toHaveAttribute('data-pdf-annotation-focus', '');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-pdf-annotation][data-selected]')).toHaveCount(1);
});

// ── from features ──

test('find streams results and highlights them', async ({ page }) => {
	await page.goto('/demo/find');
	await ready(page);
	await expect(page.locator('[data-pdf-find-result]').first()).toBeVisible();
	expect(await page.locator('[data-pdf-find-result]').count()).toBeGreaterThan(50);
	await expect(page.locator('[data-pdf-find-match]').first()).toBeAttached();
});

test('select → highlight → note in the margin → undo @smoke', async ({ page }) => {
	await page.goto('/demo/annotations-markup');
	await ready(page);
	await selectText(page, { min: 250 });
	await page.locator('[data-pdf-selection-menu] [data-color=green]').click();
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(1);
	await page.locator('[data-pdf-annotation-popover] textarea').fill('A side note');
	await expect(page.locator('[data-pdf-margin-note] textarea')).toHaveValue('A side note');
	// Enter keeps the new annotation (Esc would discard it).
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-pdf-annotation-popover]')).toHaveCount(0);
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(1);
	await page.locator('[data-pdf-viewport]').focus();
	await page.keyboard.press('ControlOrMeta+z');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(0);
});

test('export → re-open: annotations come back from the PDF file @smoke', async ({ page }) => {
	await page.goto('/demo/export-import');
	await ready(page);
	await selectText(page, { min: 250 });
	await page.locator('[data-pdf-selection-menu] [data-color=blue]').click();
	await page.locator('[data-pdf-annotation-popover] textarea').fill('round trip');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Re-open exported' }).click();
	await expect(page.getByText(/Read 1 annotations from the file/)).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight][data-color=blue]')).toHaveCount(1);
});

test('citation hotspots open a reference card', async ({ page }) => {
	await page.goto('/demo/citations');
	await ready(page);
	await page.locator('[data-pdf-viewport]').evaluate((el) => (el.scrollTop = 1400));
	const cite = page.locator('[data-pdf-citation]').first();
	await expect(cite).toBeAttached({ timeout: 15_000 });
	await cite.hover();
	await expect(page.locator('[data-pdf-citation-card]')).toBeVisible();
	await page.locator('[data-pdf-citation-card] [data-part=footer] button').first().click();
	await expect(page.locator('[data-pdf-back-button]')).toBeVisible();
});

// ── from context-menu ──

test('context menus offer the right actions with their shortcuts @smoke', async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await page.goto('/demo/context-menu');
	await expect(page.locator('[data-pdf-text-layer][data-rendered]').first()).toBeAttached({ timeout: 30_000 });
	const items = page.locator('[role=menu] [role=menuitem]');

	// Empty page area.
	await page.mouse.click(700, 520, { button: 'right' });
	await expect(items.filter({ hasText: 'Add note here' })).toBeVisible();
	await expect(items.filter({ hasText: 'Fit width' })).toContainText(/0/);
	await page.keyboard.press('Escape');
	await expect(page.locator('[role=menu]')).toHaveCount(0);

	// Selected text → highlight from the menu.
	const spans = page.locator('[data-pdf-page="1"] [data-pdf-text-layer] span');
	const idx = await spans.evaluateAll((els) => els.map((e, i) => [i, e.getBoundingClientRect().top] as const).filter(([, t]) => t > 300 && t < 700).map(([i]) => i));
	const a = (await spans.nth(idx[0]).boundingBox())!;
	const b = (await spans.nth(idx[2]).boundingBox())!;
	await page.mouse.move(a.x + 1, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
	await page.mouse.click(b.x + 5, b.y + b.height / 2, { button: 'right' });
	await expect(items.filter({ hasText: 'Copy with formatting' })).toBeVisible();
	await page.getByRole('menuitem', { name: 'Highlight H', exact: true }).click();
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(1);

	// The highlight → annotation actions.
	const quad = (await page.locator('[data-pdf-annotation][data-kind=highlight] polygon').first().boundingBox())!;
	await page.mouse.click(quad.x + 4, quad.y + quad.height / 2, { button: 'right' });
	await expect(items.filter({ hasText: 'Edit note' })).toBeVisible();
	await items.filter({ hasText: 'Delete' }).click();
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(0);

	// "?" lists every shortcut.
	await page.keyboard.press('?');
	await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

// Side notes keep room on the right (--pdf-pages-aside) without pushing the page off centre:
// in narrow views the notes overflow (scrollable) and the page stays in the middle.
test('pages stay centred next to the side-note margin @smoke', async ({ page }) => {
	const offset = () =>
		page.evaluate(() => {
			const vp = document.querySelector('[data-pdf-viewport]') as HTMLElement;
			const v = vp.getBoundingClientRect();
			const p = vp.querySelector('[data-pdf-page="1"]')!.getBoundingClientRect();
			return Math.abs(p.left - v.left - (v.left + vp.clientWidth - p.right));
		});
	await page.setViewportSize({ width: 1800, height: 900 });
	await page.goto('/demo/annotations-markup');
	await rendered(page);
	for (const width of [1800, 1300, 1000]) {
		await page.setViewportSize({ width, height: 900 });
		await expect.poll(offset, { message: `centred at ${width}px` }).toBeLessThanOrEqual(2);
	}
	// Embedded in a docs page (a narrow frame), and fitted to the width.
	for (const path of ['/examples/annotations-markup', '/examples/reader']) {
		await page.goto(path);
		await rendered(page);
		await expect.poll(offset, { message: path }).toBeLessThanOrEqual(2);
	}
});

// Side notes never add a scrollbar: full notes when there is room, compact markers otherwise.
test('side notes adapt to the room beside the page @smoke', async ({ page }) => {
	const overflow = () =>
		page.evaluate(() => {
			const vp = document.querySelector('[data-pdf-viewport]') as HTMLElement;
			return vp.scrollWidth - vp.clientWidth;
		});
	const shot = (name: string) =>
		process.env.SHOTS && page.locator('[data-pdf-viewport]').first().screenshot({ path: `${process.env.SHOTS}/${name}.png` });
	await page.setViewportSize({ width: 1800, height: 900 });
	await page.goto('/demo/annotations-readonly');
	await rendered(page);
	await expect(page.locator('[data-pdf-annotation-margin][data-layout=notes] [data-pdf-margin-note]').first()).toBeVisible();
	expect(await overflow()).toBeLessThanOrEqual(0);
	await shot('notes-wide');

	await page.setViewportSize({ width: 900, height: 900 });
	const marker = page.locator('[data-pdf-annotation-margin][data-layout=markers] [data-pdf-margin-marker]').first();
	await expect(marker).toBeVisible();
	expect(await overflow()).toBeLessThanOrEqual(0);
	await marker.click();
	await expect(page.locator('[data-pdf-annotation-popover]')).toBeVisible();
	await shot('notes-narrow');
});

test('the hand tool drags the pages, with grab cursors', async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await page.goto('/demo/annotator');
	await ready(page);
	const viewport = page.locator('[data-pdf-viewport]').first();
	await page.locator('[data-pdf-annotation-tool="hand"]').first().click();
	await expect(viewport).toHaveAttribute('data-pan', '');
	expect(await viewport.evaluate((el) => getComputedStyle(el).cursor)).toBe('grab');

	const box = (await viewport.boundingBox())!;
	const before = await viewport.evaluate((el) => el.scrollTop);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4, { steps: 8 });
	await expect(viewport).toHaveAttribute('data-panning', '');
	expect(await viewport.evaluate((el) => getComputedStyle(el).cursor)).toBe('grabbing');
	await page.mouse.up();
	await expect(viewport).not.toHaveAttribute('data-panning');
	expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 100);
	// Dragging doesn't select text.
	expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');

	await page.locator('[data-pdf-annotation-tool="select"]').first().click();
	await expect(viewport).not.toHaveAttribute('data-pan');
});
