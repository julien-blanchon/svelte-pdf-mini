/**
 * Small readers over pdf-lib objects (shared by the writer and the reader).
 * They take the loaded library so pdf-lib stays a lazy import.
 */
import type {
	PDFArray,
	PDFContext,
	PDFDict,
	PDFDocument,
	PDFObject,
	PDFRef
} from '@cantoo/pdf-lib';
import type { Annotation } from '../annotations/model.js';
import { EMBEDDED_FILE_NAME, type PdfLib } from './shared.js';

export function makeReaders(lib: PdfLib, ctx: PDFContext) {
	const { PDFName, PDFNumber, PDFString, PDFHexString, PDFArray, PDFDict, PDFRef, PDFBool } = lib;

	const resolve = (o: PDFObject | undefined): PDFObject | undefined =>
		o instanceof PDFRef ? ctx.lookup(o) : o;

	const get = (dict: PDFDict, key: string) => resolve(dict.get(PDFName.of(key)));

	const text = (dict: PDFDict, key: string): string | undefined => {
		const v = get(dict, key);
		if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
		return undefined;
	};

	const name = (dict: PDFDict, key: string): string | undefined => {
		const v = get(dict, key);
		return v instanceof PDFName ? v.decodeText() : undefined;
	};

	const num = (dict: PDFDict, key: string): number | undefined => {
		const v = get(dict, key);
		return v instanceof PDFNumber ? v.asNumber() : undefined;
	};

	const bool = (dict: PDFDict, key: string): boolean | undefined => {
		const v = get(dict, key);
		return v instanceof PDFBool ? v.asBoolean() : undefined;
	};

	const numbers = (o: PDFObject | undefined): number[] | undefined => {
		const arr = resolve(o);
		if (!(arr instanceof PDFArray)) return undefined;
		const out: number[] = [];
		for (const item of arr.asArray()) {
			const v = resolve(item);
			if (v instanceof PDFNumber) out.push(v.asNumber());
		}
		return out;
	};

	const nums = (dict: PDFDict, key: string) => numbers(dict.get(PDFName.of(key)));

	const array = (dict: PDFDict, key: string): PDFArray | undefined => {
		const v = get(dict, key);
		return v instanceof PDFArray ? v : undefined;
	};

	const dictOf = (o: PDFObject | undefined): PDFDict | undefined => {
		const v = resolve(o);
		return v instanceof PDFDict ? v : undefined;
	};

	const refOf = (dict: PDFDict, key: string): PDFRef | undefined => {
		const v = dict.get(PDFName.of(key));
		return v instanceof PDFRef ? v : undefined;
	};

	return { resolve, get, text, name, num, bool, numbers, nums, array, dictOf, refOf };
}

export type Readers = ReturnType<typeof makeReaders>;

/** The model stored in the embedded `svelte-pdf-mini.json`, keyed by id. */
export function readEmbeddedModel(doc: PDFDocument): Map<string, Annotation> {
	const map = new Map<string, Annotation>();
	try {
		const file = doc.getAttachments().find((a) => a.name === EMBEDDED_FILE_NAME);
		if (!file) return map;
		const json = JSON.parse(new TextDecoder().decode(file.data));
		for (const a of json?.annotations ?? []) if (a && typeof a.id === 'string') map.set(a.id, a);
	} catch {
		// Corrupt or foreign file with our name: ignore, the per-annotation data still works.
	}
	return map;
}
