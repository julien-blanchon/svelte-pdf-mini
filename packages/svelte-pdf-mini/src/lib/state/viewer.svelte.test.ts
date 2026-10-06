import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { PdfDocument } from './document.svelte.js';
import { ViewerState, type ViewerOptions } from './viewer.svelte.js';

/** Just enough of a document for zoom and layout logic (no pages loaded). */
function fakeDocument(numPages = 10) {
	return {
		status: 'idle',
		proxy: null,
		numPages,
		pageSize: () => ({ width: 612, height: 792 }),
		pageLabel: (n: number) => String(n),
		pageTextSync: () => undefined
	} as unknown as PdfDocument;
}

function setup(opts: Partial<ViewerOptions> = {}, numPages = 10) {
	let viewer!: ViewerState;
	const cleanup = $effect.root(() => {
		viewer = new ViewerState({ document: fakeDocument(numPages), smoothZoom: false, ...opts });
	});
	flushSync();
	return { viewer, cleanup };
}

describe('zoom limits', () => {
	it('clamps zoomTo, the zoom setter and an initial zoom to minZoom / maxZoom', () => {
		const { viewer, cleanup } = setup({ minZoom: 0.5, maxZoom: 3, zoom: 5 });
		expect(viewer.zoom).toBe(3);
		viewer.zoomTo(0.1);
		flushSync();
		expect(viewer.zoom).toBe(0.5);
		viewer.zoom = 9;
		expect(viewer.zoom).toBe(3);
		cleanup();
	});

	it('raises a maxZoom below minZoom to it', () => {
		const { viewer, cleanup } = setup({ minZoom: 2, maxZoom: 1 });
		expect(viewer.minZoom).toBe(2);
		expect(viewer.maxZoom).toBe(2);
		cleanup();
	});

	it('re-clamps the current zoom when the limits change', () => {
		const limits = $state({ max: 4 });
		const { viewer, cleanup } = setup({ maxZoom: () => limits.max, zoom: 3 });
		expect(viewer.zoom).toBe(3);
		limits.max = 2;
		flushSync();
		expect(viewer.zoom).toBe(2);
		cleanup();
	});

	it('zoomLocked: user zooming does nothing and the buttons are disabled', () => {
		const { viewer, cleanup } = setup({ zoomLocked: true, zoom: 1, zoomMode: 'manual' });
		viewer.zoomTo(2);
		viewer.zoom = 2;
		viewer.zoomIn();
		viewer.zoomMode = 'page-width';
		flushSync();
		expect(viewer.zoom).toBe(1);
		expect(viewer.zoomMode).toBe('manual');
		expect(viewer.canZoomIn).toBe(false);
		expect(viewer.canZoomOut).toBe(false);
		cleanup();
	});
});

describe('fit modes within the limits', () => {
	const fitted = (maxZoom?: number) => {
		const doc = fakeDocument();
		(doc as unknown as { status: string }).status = 'ready';
		let viewer!: ViewerState;
		const cleanup = $effect.root(() => {
			viewer = new ViewerState({
				document: doc,
				smoothZoom: false,
				zoomMode: 'page-width',
				maxZoom,
				zoom: 0.5
			});
		});
		flushSync();
		// A wide view: page width fits a 612pt page above 1 (about 1.2 with the padding).
		viewer.available = { width: 1000, height: 800 };
		flushSync();
		return { viewer, cleanup };
	};

	it('fits the width when the limits allow it', () => {
		const { viewer, cleanup } = fitted();
		expect(viewer.zoom).toBeGreaterThan(1.1);
		expect(viewer.zoomMode).toBe('page-width');
		cleanup();
	});

	it('a fit wider than maxZoom stays a fit (clamped), not a manual zoom', () => {
		const { viewer, cleanup } = fitted(1);
		expect(viewer.zoom).toBe(1);
		expect(viewer.zoomMode).toBe('page-width');
		// Still a fit: a narrower view follows it.
		viewer.available = { width: 500, height: 800 };
		flushSync();
		expect(viewer.zoom).toBeLessThan(1);
		cleanup();
	});
});

describe('hasNeighbor (spreads)', () => {
	it('single pages have no neighbor', () => {
		const { viewer, cleanup } = setup({ columns: 1 });
		expect(viewer.hasNeighbor(1, 'right')).toBe(false);
		expect(viewer.hasNeighbor(2, 'left')).toBe(false);
		cleanup();
	});

	it('a two-page spread pairs 1–2, 3–4', () => {
		const { viewer, cleanup } = setup({ columns: 2 });
		expect(viewer.hasNeighbor(1, 'right')).toBe(true);
		expect(viewer.hasNeighbor(1, 'left')).toBe(false);
		expect(viewer.hasNeighbor(2, 'left')).toBe(true);
		expect(viewer.hasNeighbor(2, 'right')).toBe(false);
		cleanup();
	});

	it('with the cover alone, page 1 has no neighbor and rows are 2–3, 4–5', () => {
		const { viewer, cleanup } = setup({ columns: 2, firstPageAlone: true });
		expect(viewer.hasNeighbor(1, 'right')).toBe(false);
		expect(viewer.hasNeighbor(1, 'left')).toBe(false);
		expect(viewer.hasNeighbor(2, 'right')).toBe(true);
		expect(viewer.hasNeighbor(3, 'left')).toBe(true);
		expect(viewer.hasNeighbor(3, 'right')).toBe(false);
		cleanup();
	});

	it('the last page of an odd document has no right neighbor', () => {
		const { viewer, cleanup } = setup({ columns: 2 }, 5);
		expect(viewer.hasNeighbor(5, 'right')).toBe(false);
		expect(viewer.hasNeighbor(5, 'left')).toBe(false);
		cleanup();
	});
});
