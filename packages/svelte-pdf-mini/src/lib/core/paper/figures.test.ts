import { describe, expect, it } from 'vitest';
import { columnFor, frame, textColumns } from './figures.js';
import type { Line } from './lines.js';

const page = { width: 612, height: 792 };
const prose =
	'the model is trained on a large corpus of text and we report the results in the table';
/** A body-size running-text line from x to right at baseline y. */
const line = (x: number, right: number, y: number, text = prose): Line => ({
	page: 1,
	start: 0,
	end: text.length,
	text,
	size: 10,
	font: 'Times',
	x,
	right,
	y,
	top: y + 8,
	bottom: y - 2,
	rotated: false
});

describe('textColumns', () => {
	it('finds one column from wide running text', () => {
		const lines = [100, 200, 300, 400, 500].map((y) => line(108, 504, y));
		expect(textColumns(lines, 10, page)).toEqual([[108, 504]]);
	});

	it('finds two columns from running text on both halves', () => {
		const lines = [100, 200, 300, 400, 500].flatMap((y) => [line(54, 297, y), line(315, 558, y)]);
		expect(textColumns(lines, 10, page)).toEqual([
			[54, 297],
			[315, 558]
		]);
	});

	it('gives up on a page without running text (a full-page figure)', () => {
		expect(textColumns([line(108, 200, 400, 'Figure 3: samples')], 10, page)).toBeNull();
	});
});

describe('columnFor', () => {
	const cols: [number, number][] = [
		[54, 297],
		[315, 558]
	];
	it('picks the column a box sits in', () => {
		expect(columnFor(cols, [60, 0, 280, 10])).toEqual([54, 297]);
		expect(columnFor(cols, [330, 0, 550, 10])).toEqual([315, 558]);
	});
	it('spans both columns for a box across the gutter', () => {
		expect(columnFor(cols, [80, 0, 520, 10])).toEqual([54, 558]);
	});
});

describe('frame', () => {
	const col: [number, number] = [108, 504];
	it('widens a box that nearly fills its column to the whole column, with padding', () => {
		expect(frame([150, 300, 460, 500], col, page)).toEqual([104, 296, 508, 504]);
	});
	it('only pads a narrow box', () => {
		expect(frame([250, 300, 360, 500], col, page)).toEqual([246, 296, 364, 504]);
	});
	it('never widens when asked not to (half-column figures)', () => {
		expect(frame([150, 300, 460, 500], col, page, { minShare: Infinity })).toEqual([
			146, 296, 464, 504
		]);
	});
	it('stays on the page', () => {
		expect(frame([2, 1, 610, 791], [0, 612], page)).toEqual([0, 0, 612, 792]);
	});
});
