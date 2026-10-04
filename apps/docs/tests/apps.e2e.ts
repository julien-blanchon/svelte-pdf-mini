import { expect, test } from '@playwright/test';
import { noErrors, ready, rendered, selectText } from './helpers.ts';

// ── from apps ──

test('reader: contents, find and URL position @smoke', async ({ page }) => {
	const errors = noErrors(page);
	await page.goto('/demo/reader?paper=1512.03385');
	await rendered(page);
	await expect(page.locator('[data-pdf-toc=tree] [data-pdf-toc-item]').first()).toBeAttached({ timeout: 20_000 });
	await page.keyboard.press('Control+f');
	await page.keyboard.type('residual');
	await expect(page.locator('[data-pdf-find-count]')).toContainText('/', { timeout: 10_000 });
	await expect.poll(() => page.url()).toContain('#page=');
	expect(errors).toEqual([]);
});

test('reader: highlight persists across reloads', async ({ page }) => {
	await page.goto('/demo/reader?paper=1706.03762');
	await rendered(page);
	await page.evaluate(() => localStorage.clear());
	await selectText(page, { min: 350 });
	await page.locator('[data-pdf-selection-menu] [data-color=green]').click();
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(1);
	await page.reload();
	await rendered(page);
	await expect(page.locator('[data-pdf-annotation][data-kind=highlight]')).toHaveCount(1, { timeout: 15_000 });
});

test('annotator: box a region and list it', async ({ page }) => {
	await page.goto('/demo/annotator');
	await rendered(page);
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await rendered(page);
	await page.locator('[data-pdf-annotation-tool=area]').click();
	const pg = (await page.locator('[data-pdf-page="1"]').boundingBox())!;
	await page.mouse.move(pg.x + pg.width * 0.2, pg.y + 120);
	await page.mouse.down();
	await page.mouse.move(pg.x + pg.width * 0.6, pg.y + 260, { steps: 5 });
	await page.mouse.up();
	await expect(page.locator('[data-pdf-annotation][data-kind=area]')).toHaveCount(1);
	await expect(page.locator('[data-pdf-annotation-list-item]')).toHaveCount(1);
});

test('library: covers render, quick look opens and closes cleanly', async ({ page }) => {
	const errors = noErrors(page);
	const warnings: string[] = [];
	page.on('console', (m) => m.type() === 'warning' && /svelte/i.test(m.text()) && warnings.push(m.text()));
	await page.goto('/demo/library');
	await expect(page.locator('[data-pdf-canvas][data-rendered]')).toHaveCount(6, { timeout: 60_000 });
	const heights = await page.locator('li .aspect-\\[4\\/3\\]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
	expect(new Set(heights).size).toBe(1); // equal-size covers
	await page.locator('ul button').first().click();
	await expect(page.locator('[role=dialog] a')).toHaveAttribute('href', /\/demo\/reader\?paper=/);
	await rendered(page);
	await page.keyboard.press('Escape');
	await expect(page.locator('[role=dialog]')).toHaveCount(0);
	// Reopen: the card ⇄ dialog morph still works after a close.
	await page.locator('ul button').nth(1).click();
	await expect(page.locator('[role=dialog]')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('[role=dialog]')).toHaveCount(0);
	expect(errors).toEqual([]);
	expect(warnings).toEqual([]);
});

test('compare: both versions render with section breadcrumbs', async ({ page }) => {
	// Two arXiv PDFs at once: slow when the whole suite runs in parallel.
	test.setTimeout(120_000);
	await page.goto('/demo/compare');
	await expect(page.locator('[data-pdf-viewport]')).toHaveCount(2);
	await expect(page.locator('[data-pdf-canvas][data-rendered]').nth(1)).toBeAttached({ timeout: 40_000 });
	await page.mouse.move(400, 500);
	await page.locator('[data-pdf-viewport]').first().evaluate((el) => (el.scrollTop = 3000));
	await expect.poll(async () => (await page.locator('[data-pdf-toc=breadcrumb]').allTextContents()).filter((t) => t.trim()).length, { timeout: 45_000 }).toBe(2);
});

test('embed: single page viewer with citation card', async ({ page }) => {
	await page.goto('/demo/embed');
	await rendered(page);
	await page.locator('[data-pdf-page-next]').click();
	const cite = page.locator('[data-pdf-citation]').first();
	await expect(cite).toBeAttached({ timeout: 20_000 });
	await cite.hover();
	await expect(page.locator('[data-pdf-citation-card]')).toBeVisible({ timeout: 5_000 });
});

test.describe('mobile', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
	test('bottom sheet with contents', async ({ page }) => {
		await page.goto('/demo/mobile');
		await rendered(page);
		await page.getByRole('button', { name: 'Contents' }).click();
		await expect(page.locator('[data-pdf-toc-item]').first()).toBeVisible({ timeout: 20_000 });
	});
});
