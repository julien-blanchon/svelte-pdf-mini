/**
 * The pdf.js operator codes the graphics analysis reads (`OPS` in pdfjs-dist).
 * Copied so that importing the analysis doesn't pull pdf.js into the initial
 * bundle (pdf.js is loaded lazily, in the browser); `ops.test.ts` checks they
 * still match the installed pdf.js.
 */
export const OPS = {
	setLineWidth: 2,
	save: 10,
	restore: 11,
	transform: 12,
	stroke: 20,
	closeStroke: 21,
	fill: 22,
	eoFill: 23,
	fillStroke: 24,
	eoFillStroke: 25,
	closeFillStroke: 26,
	closeEOFillStroke: 27,
	endPath: 28,
	clip: 29,
	eoClip: 30,
	paintFormXObjectBegin: 74,
	paintFormXObjectEnd: 75,
	paintImageMaskXObject: 83,
	paintImageXObject: 85,
	paintInlineImageXObject: 86,
	paintImageXObjectRepeat: 88,
	constructPath: 91
} as const;
