import { expect, test } from '@playwright/test';

// Every page listed in the sitemap (generated from the navigation config).
test('every docs page renders without errors', async ({ page, request, baseURL }) => {
	test.setTimeout(300_000);
	const xml = await (await request.get('/sitemap.xml')).text();
	const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter((p) => !p.endsWith('.txt'));
	expect(paths.length).toBeGreaterThan(30);
	const failures: string[] = [];
	for (const path of paths) {
		const errors: string[] = [];
		const onError = (e: Error) => errors.push(e.message);
		page.on('pageerror', onError);
		const res = await page.goto(new URL(path, baseURL).href);
		if ((res?.status() ?? 500) >= 400) failures.push(`${path}: HTTP ${res?.status()}`);
		else if (!(await page.locator('h1').first().isVisible())) failures.push(`${path}: no h1`);
		if (errors.length) failures.push(`${path}: ${errors[0]}`);
		page.off('pageerror', onError);
	}
	expect(failures).toEqual([]);
});

test('component pages have generated API tables @smoke', async ({ page }) => {
	await page.goto('/components/viewer');
	await expect(page.locator('#api-viewer-root')).toBeVisible();
	await expect(page.locator('table').filter({ hasText: 'zoomMode' })).toBeVisible();
});
