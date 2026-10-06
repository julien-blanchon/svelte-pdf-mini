import { describe, expect, it } from 'vitest';
import type { PDFPageProxy } from 'pdfjs-dist';
import { pageGraphics } from './image-boxes.js';
import { OPS } from './ops.js';

/** A page whose operator list is given (pdf.js `endPath` is 28: a clip-only path). */
function page(ops: [number, unknown[]][]) {
	return {
		view: [0, 0, 612, 792],
		getOperatorList: async () => ({
			fnArray: ops.map((o) => o[0]),
			argsArray: ops.map((o) => o[1])
		})
	} as unknown as PDFPageProxy;
}
const END_PATH = 28;
/** `re … W n`: a rectangular clip path, in the current user space. */
const clipRect = (x0: number, y0: number, x1: number, y1: number): [number, unknown[]][] => [
	[OPS.clip, []],
	[OPS.constructPath, [END_PATH, null, [x0, y0, x1, y1]]]
];
/** An image drawn in the unit square under `cm a 0 0 d e f`. */
const image = (w: number, h: number, x: number, y: number): [number, unknown[]][] => [
	[OPS.save, []],
	[OPS.transform, [w, 0, 0, h, x, y]],
	[OPS.paintImageXObject, []],
	[OPS.restore, []]
];

describe('pageGraphics clipping', () => {
	it('an image placed larger than shown is measured by its clip', async () => {
		const g = await pageGraphics(
			page([
				[OPS.save, []],
				...clipRect(100, 500, 500, 600),
				...image(400, 400, 100, 300),
				[OPS.restore, []]
			])
		);
		expect(g.images).toEqual([[100, 500, 500, 600]]);
	});

	it('the clip ends with its save / restore block', async () => {
		const g = await pageGraphics(
			page([
				[OPS.save, []],
				...clipRect(100, 500, 500, 600),
				[OPS.restore, []],
				...image(200, 100, 100, 100)
			])
		);
		expect(g.images).toEqual([[100, 100, 300, 200]]);
	});

	it('an image entirely outside its clip is not a figure', async () => {
		const g = await pageGraphics(
			page([
				[OPS.save, []],
				...clipRect(0, 0, 50, 50),
				...image(200, 100, 300, 300),
				[OPS.restore, []]
			])
		);
		expect(g.images).toEqual([]);
	});
});
