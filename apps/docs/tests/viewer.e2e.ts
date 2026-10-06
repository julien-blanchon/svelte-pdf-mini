import { expect, test } from '@playwright/test';
import { noErrors, ready, rendered, selectText } from './helpers.ts';

test('every demo renders without errors', async ({ page }) => {
	test.setTimeout(300_000);
	const res = await page.request.get('/sitemap.xml');
	const slugs = [...(await res.text()).matchAll(/\/examples\/([\w-]+)</g)].map((m) => m[1]);
	expect(slugs.length).toBeGreaterThan(10);
	const failures: string[] = [];
	for (const slug of slugs) {
		const errors = noErrors(page);
		await page.goto(`/demo/${slug}`);
		try {
			await rendered(page);
		} catch {
			failures.push(`${slug}: no page rendered`);
		}
		if (errors.length) failures.push(`${slug}: ${errors[0]}`);
		page.removeAllListeners('pageerror');
	}
	expect(failures).toEqual([]);
});

// Regression: bitmaps restored from the page cache were shown at their pixel
// size, so a page came back as a "super zoomed" crop of its top-left corner.
// Only visible on HiDPI screens (bitmap pixels ≠ CSS pixels).
test.describe(() => {
	test.use({ deviceScaleFactor: 2 });
	test('pages restored from the bitmap cache fill their box @smoke', async ({ page }) => {
		await page.goto('/demo/minimal');
		await rendered(page);
		const scroller = page.locator('[data-pdf-viewport]').first();
		await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
		await page.waitForTimeout(600);
		await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
		await expect(page.locator('[data-pdf-page="1"] [data-pdf-canvas][data-rendered]')).toBeAttached();
		await page.waitForTimeout(300);
		const sizes = await page.locator('[data-pdf-page="1"]').evaluate((p) => {
			const box = p.getBoundingClientRect();
			return [...p.querySelectorAll('canvas')].map((c) => {
				const r = c.getBoundingClientRect();
				return [Math.round(r.width - box.width), Math.round(r.height - box.height)];
			});
		});
		expect(sizes.length).toBeGreaterThan(0);
		for (const [dw, dh] of sizes) {
			expect(Math.abs(dw)).toBeLessThanOrEqual(2);
			expect(Math.abs(dh)).toBeLessThanOrEqual(2);
		}
	});
});

// ── from examples ──

test('focus() scrolls to a named destination', async ({ page }) => {
	await page.goto('/demo/focus');
	await rendered(page);
	await page.getByRole('button', { name: 'figure', exact: true }).click();
	await page.locator('aside li button', { hasText: 'figure.1' }).click();
	await expect(page.locator('[data-pdf-page="3"] [data-pdf-focus]')).toBeAttached();
	await expect(page.locator('[data-pdf-page="3"]')).toHaveAttribute('data-current', '');
});

test('rotated pages: the text layer lines up with the page', async ({ page }) => {
	await page.goto('/demo/zoom');
	await expect(page.locator('[data-pdf-text-layer][data-rendered]').first()).toBeAttached({ timeout: 40_000 });
	await page.locator('[data-pdf-viewport]').first().focus();
	await page.keyboard.press('ControlOrMeta+]');
	const layer = page.locator('[data-pdf-page="1"] [data-pdf-text-layer]');
	await expect(layer).toHaveAttribute('data-main-rotation', '90', { timeout: 10_000 });
	await page.waitForTimeout(500);
	const [l, p] = await Promise.all([
		layer.boundingBox(),
		page.locator('[data-pdf-page="1"]').boundingBox()
	]);
	// The rotated layer covers the rotated (landscape) page box.
	expect(Math.abs(l!.x - p!.x)).toBeLessThan(3);
	expect(Math.abs(l!.y - p!.y)).toBeLessThan(3);
	expect(Math.abs(l!.width - p!.width)).toBeLessThan(3);
	expect(Math.abs(l!.height - p!.height)).toBeLessThan(3);
});

test('ctrl+wheel zoom commits a new zoom @smoke', async ({ page }) => {
	await page.goto('/demo/zoom');
	await expect(page.locator('[data-pdf-canvas][data-rendered]').first()).toBeAttached({ timeout: 30_000 });
	const before = await page.locator('span.tabular-nums').textContent();
	await page.mouse.move(700, 500);
	await page.keyboard.down('Control');
	await page.mouse.wheel(0, -100);
	await page.keyboard.up('Control');
	await expect(page.locator('span.tabular-nums')).not.toHaveText(before!, { timeout: 3000 });
	await expect(page.locator('span.tabular-nums')).toContainText('manual');
});

test('zooming a narrow page keeps it centred', async ({ page }) => {
	await page.goto('/demo/zoom');
	await expect(page.locator('[data-pdf-canvas][data-rendered]').first()).toBeAttached({ timeout: 30_000 });
	await page.locator('button[aria-label=Zoom]').first().click();
	await page.getByRole('option', { name: '50%', exact: true }).click();
	await expect(page.locator('span.tabular-nums').last()).toContainText('50%', { timeout: 3_000 });
	await page.mouse.move(400, 600);
	await page.keyboard.down('Control');
	for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -50);
	await page.keyboard.up('Control');
	await page.waitForTimeout(500);
	const offset = await page.evaluate(() => {
		const pg = document.querySelector('[data-pdf-page="1"]')!.getBoundingClientRect();
		const vp = document.querySelector('[data-pdf-viewport]')!.getBoundingClientRect();
		return Math.abs(pg.left + pg.width / 2 - (vp.left + vp.width / 2));
	});
	expect(offset).toBeLessThan(2);
});

test('auto columns grow as you zoom out', async ({ page }) => {
	await page.goto('/demo/layouts');
	await expect(page.locator('[data-pdf-canvas][data-rendered]').first()).toBeAttached({ timeout: 30_000 });
	const pages = page.locator('[data-pdf-pages]');
	await expect(pages).toHaveAttribute('data-columns', '1');
	for (let i = 0; i < 4; i++) await page.locator('[data-pdf-zoom-out]').click();
	await expect.poll(async () => Number(await pages.getAttribute('data-columns'))).toBeGreaterThan(1);
});

// ── from perf-minimap ──

test('minimap previews come back after switching variants (bitmaps are not neutered)', async ({ page }) => {
	await page.goto('/demo/minimap');
	await ready(page);
	const previews = page.locator('[data-pdf-minimap-page][data-kind=pages] canvas');
	await expect(previews.first()).toBeAttached({ timeout: 20_000 });
	await page.getByRole('radio', { name: 'Blocks' }).click();
	await expect(page.locator('[data-pdf-minimap-page][data-kind=blocks]').first()).toBeAttached();
	await page.getByRole('radio', { name: 'Pages' }).click();
	await expect.poll(() => previews.evaluateAll((cs) => cs.filter((c) => (c as HTMLCanvasElement).width > 0).length), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('minimap is a keyboard-operable scrollbar', async ({ page }) => {
	await page.goto('/demo/minimap');
	await ready(page);
	const viewport = page.locator('[data-pdf-viewport]');
	await page.locator('[data-pdf-minimap]').focus();
	const before = await viewport.evaluate((e) => e.scrollTop);
	await page.keyboard.press('PageDown');
	await expect.poll(() => viewport.evaluate((e) => e.scrollTop)).toBeGreaterThan(before + 100);
	await page.keyboard.press('Home');
	await expect.poll(() => viewport.evaluate((e) => e.scrollTop)).toBeLessThan(5);
});

test('minimap variants render', async ({ page }) => {
	await page.goto('/demo/minimap');
	await ready(page);
	await page.getByRole('radio', { name: 'Text structure' }).click();
	await expect(page.locator('[data-pdf-minimap-page][data-kind=text] canvas').first()).toBeAttached();
	await page.getByRole('radio', { name: 'Section spine' }).click();
	await expect(page.locator('[data-pdf-minimap-band]').first()).toBeAttached({ timeout: 20_000 });
	await page.getByRole('radio', { name: 'Heatmap' }).click();
	await expect(page.locator('[data-pdf-minimap-heat]').first()).toBeAttached({ timeout: 20_000 });
});

test('zoomed-out spreads skip text layers (level of detail)', async ({ page }) => {
	await page.goto('/demo/layouts');
	await ready(page);
	// Zoom out until pages are narrower than the 260px detail threshold.
	const pageWidth = () => page.locator('[data-pdf-page="1"]').evaluate((e) => e.getBoundingClientRect().width);
	for (let i = 0; i < 12 && (await pageWidth()) >= 240; i++) {
		await page.locator('[data-pdf-zoom-out]').click();
		await page.waitForTimeout(250);
	}
	expect(await pageWidth()).toBeLessThan(260);
	await page.waitForTimeout(800);
	expect(await page.locator('[data-pdf-text-layer] span').count()).toBe(0);
	// Zooming back in restores selectable text.
	for (let i = 0; i < 8; i++) await page.locator('[data-pdf-zoom-in]').click();
	await expect(page.locator('[data-pdf-text-layer] span').first()).toBeAttached({ timeout: 15_000 });
});

// ── from round2 ──

test('zoom select animates to the chosen value', async ({ page }) => {
	await page.goto('/demo/zoom');
	await ready(page);
	await page.locator('button[aria-label=Zoom]').first().click();
	await page.getByRole('option', { name: '200%' }).click();
	const status = page.locator('span.tabular-nums').last();
	await expect(status).not.toContainText('200%'); // still easing right after the click
	await expect(status).toContainText('200%', { timeout: 3_000 });
});

test('annotation workflow: H, note, Enter, click selects, Delete, Esc discards', async ({ page }) => {
	await page.goto('/demo/annotations-markup');
	await ready(page);
	await selectText(page, { min: 400 });
	await page.keyboard.press('h');
	await expect(page.locator('[data-pdf-annotation-popover][data-pending]')).toHaveCount(1);
	await page.keyboard.type('Key claim');
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-pdf-annotation-popover]')).toHaveCount(0);
	const hl = (await page.locator('[data-pdf-annotation][data-kind=highlight] polygon').first().boundingBox())!;
	await page.mouse.click(hl.x + 8, hl.y + hl.height / 2);
	await expect(page.locator('[data-pdf-annotation-popover]')).toHaveCount(1); // a single click selects
	await page.locator('[data-pdf-viewport]').focus();
	await page.keyboard.press('Delete');
	await expect(page.locator('[data-pdf-annotation]')).toHaveCount(0);
	await selectText(page, { min: 400 });
	await page.keyboard.press('u');
	await expect(page.locator('[data-pdf-annotation]')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-pdf-annotation]')).toHaveCount(0);
});

test('drawing a box returns to select; corners resize', async ({ page }) => {
	await page.goto('/demo/annotations-draw');
	await ready(page);
	await page.locator('[data-pdf-viewport]').focus();
	await page.keyboard.press('a');
	const pg = (await page.locator('[data-pdf-page="3"]').boundingBox())!;
	await page.mouse.move(pg.x + 200, pg.y + 80);
	await page.mouse.down();
	await page.mouse.move(pg.x + 500, pg.y + 300, { steps: 5 });
	await page.mouse.up();
	await expect(page.locator('[data-pdf-annotation-tool=select][data-active]')).toHaveCount(1);
	await page.keyboard.press('Enter');
	const rect = page.locator('[data-pdf-annotation][data-kind=area] rect');
	const before = (await rect.boundingBox())!;
	await page.mouse.click(before.x + 2, before.y + 30);
	const h = (await page.locator('[data-handle=se]').boundingBox())!;
	await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
	await page.mouse.down();
	await page.mouse.move(h.x + 60, h.y + 40, { steps: 4 });
	await page.mouse.up();
	await expect.poll(async () => Math.round((await rect.boundingBox())!.width)).toBeGreaterThan(Math.round(before.width) + 30);
});

test('melt-ui table of contents follows Paper.Headings', async ({ page }) => {
	await page.goto('/demo/outline-thumbnails');
	await ready(page);
	await expect(page.locator('a[data-id^=section-]').first()).toBeAttached({ timeout: 20_000 });
	await page.locator('a[data-id^=section-]').nth(6).click();
	await expect(page.locator('a[data-id][data-active]').first()).toBeAttached({ timeout: 5_000 });
});

test('minimap drag scrolls the document @smoke', async ({ page }) => {
	await page.goto('/demo/minimap');
	await ready(page);
	const m = (await page.locator('[data-pdf-minimap]').boundingBox())!;
	await page.mouse.move(m.x + m.width / 2, m.y + 40);
	await page.mouse.down();
	await page.mouse.move(m.x + m.width / 2, m.y + 300, { steps: 8 });
	await page.mouse.up();
	await expect.poll(async () => Number(await page.locator('[data-pdf-page][data-current]').getAttribute('data-pdf-page'))).toBeGreaterThan(3);
});

test('citation groups list every reference', async ({ page }) => {
	await page.goto('/demo/citations');
	await ready(page);
	await page.locator('[data-pdf-viewport]').evaluate((el) => (el.scrollTop = 1500));
	const group = page.locator('[data-pdf-citation][aria-label*=","]').first();
	await expect(group).toBeAttached({ timeout: 20_000 });
	await page.getByRole('radio', { name: 'List all' }).click();
	await group.hover();
	await expect(page.locator('[data-pdf-citation-card][data-layout=list] [data-part=reference]').nth(1)).toBeVisible({ timeout: 5_000 });
});
