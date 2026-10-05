// Simulates Apple Preview with PDFKit (the framework Preview uses):
//   swift preview-sim.test.helper.swift resave in.pdf out.pdf
//   swift preview-sim.test.helper.swift highlight in.pdf out.pdf   (adds a highlight + a note on page 1, then saves)
//   swift preview-sim.test.helper.swift recolor in.pdf out.pdf     (recolors every highlight to blue, then saves)
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[2])) else {
	FileHandle.standardError.write("usage: <resave|highlight|recolor> in.pdf out.pdf\n".data(using: .utf8)!)
	exit(2)
}
let page = doc.page(at: 0)!
switch args[1] {
case "highlight":
	let bounds = CGRect(x: 100, y: 400, width: 200, height: 14)
	let hl = PDFAnnotation(bounds: bounds, forType: .highlight, withProperties: nil)
	hl.color = NSColor(calibratedRed: 1, green: 0.9, blue: 0.2, alpha: 1)
	hl.contents = "made in Preview"
	hl.userName = "Preview User"
	page.addAnnotation(hl)
	let note = PDFAnnotation(bounds: CGRect(x: 500, y: 500, width: 20, height: 20), forType: .text, withProperties: nil)
	note.contents = "preview note"
	page.addAnnotation(note)
case "recolor":
	for p in 0..<doc.pageCount {
		for a in doc.page(at: p)!.annotations where a.type == "Highlight" {
			a.color = NSColor(calibratedRed: 0, green: 0, blue: 1, alpha: 1)
			a.modificationDate = Date(timeIntervalSince1970: 1_900_000_000)
		}
	}
default:
	break
}
guard doc.write(to: URL(fileURLWithPath: args[3])) else { exit(1) }
