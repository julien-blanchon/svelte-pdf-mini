import { expect, type Page } from '@playwright/test';

/** First page bitmap painted. */
export const rendered = (page: Page) =>
	expect(page.locator('[data-pdf-canvas][data-rendered]').first()).toBeAttached({ timeout: 40_000 });

/** First text layer ready (selection / annotations can start). */
export const ready = (page: Page) =>
	expect(page.locator('[data-pdf-text-layer][data-rendered]').first()).toBeAttached({ timeout: 40_000 });

/** Collects uncaught page errors. */
export const noErrors = (page: Page) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return errors;
};

/** Drag-select three visible text spans of page 1 (between `min` and `max` client y). */
export async function selectText(page: Page, { min = 300, max = 700, skip = 0 } = {}) {
	const spans = page.locator('[data-pdf-page="1"] [data-pdf-text-layer] span');
	await expect(spans.first()).toBeAttached();
	const idx = await spans.evaluateAll(
		(els, [min, max]) =>
			els
				.map((e, i) => [i, e.getBoundingClientRect().top] as const)
				.filter(([, t]) => t > min && t < max)
				.map(([i]) => i),
		[min, max]
	);
	const a = (await spans.nth(idx[skip]).boundingBox())!;
	const b = (await spans.nth(idx[skip + 2]).boundingBox())!;
	await page.mouse.move(a.x + 1, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 6 });
	await page.mouse.up();
}
