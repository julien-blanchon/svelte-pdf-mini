/** Test helper: a small PDF with a foreign annotation (no fixture download needed). */
import { loadPdfLib } from './shared.js';

/** A one-page PDF with a foreign highlight (and its popup), as Preview or Acrobat would write it. */
export async function foreignPdf(): Promise<Uint8Array> {
	const { PDFDocument, PDFHexString, StandardFonts } = await loadPdfLib();
	const doc = await PDFDocument.create({ updateMetadata: false });
	const page = doc.addPage([400, 300]);
	page.drawText('Some text to highlight', {
		x: 50,
		y: 200,
		size: 18,
		font: await doc.embedFont(StandardFonts.Helvetica)
	});
	const ctx = doc.context;
	const hl = ctx.nextRef();
	const popup = ctx.register(
		ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [260, 150, 380, 220], Parent: hl })
	);
	ctx.assign(
		hl,
		ctx.obj({
			Type: 'Annot',
			Subtype: 'Highlight',
			Rect: [50, 195, 250, 220],
			QuadPoints: [50, 220, 250, 220, 50, 195, 250, 195],
			C: [1, 1, 0],
			F: 4,
			NM: PDFHexString.fromText('preview-hl'),
			Contents: PDFHexString.fromText('from Preview'),
			M: PDFHexString.fromText('D:20250101000000Z'),
			Popup: popup
		})
	);
	page.node.addAnnot(hl);
	page.node.addAnnot(popup);
	return doc.save({ useObjectStreams: false });
}
