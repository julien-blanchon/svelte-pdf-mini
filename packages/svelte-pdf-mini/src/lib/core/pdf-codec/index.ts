/**
 * PDF annotation codec: write the model into standard PDF annotations (with
 * appearance streams and lossless private data) and read them back.
 * pdf-lib is imported lazily on first use.
 */
export { exportPdf, writtenRect, richText, type ExportOptions } from './write.js';
export { importAnnotations, type ImportOptions, type ImportResult } from './read.js';
export {
	annotationsToJSON,
	annotationsFromJSON,
	annotationsToMarkdown,
	type AnnotationsJson,
	type MarkdownOptions
} from './serialize.js';
export { appearanceOps, smoothPath, type AppearanceOps, type GraphicsState } from './appearance.js';
export {
	toPdfDate,
	fromPdfDate,
	normalizeQuad,
	EMBEDDED_FILE_NAME,
	PRIVATE_KEY
} from './shared.js';
