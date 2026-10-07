/**
 * Opening a PDF with pdf-lib the way pdf.js would: tolerate bytes before the
 * `%PDF-` header and decrypt files that open without a password (an owner
 * password only restricts permissions, which pdf.js ignores too).
 */
import type { PDFDocument } from '@cantoo/pdf-lib';
import { loadPdfLib, toBytes } from './shared.js';

/** Whether `exportPdf` can write a file, and why not. */
export interface SaveSupport {
	/** The file is encrypted (an owner password, or a password to open it). */
	encrypted: boolean;
	/**
	 * `exportPdf` can write it. Encrypted files that open without a password are
	 * saved decrypted (a full rewrite, without the owner password's restrictions).
	 */
	canSave: boolean;
	/**
	 * Why it can't: 'password' = it needs a password to open (saving it would
	 * strip that protection); 'encryption' = an encryption scheme pdf-lib can't read.
	 */
	saveBlockedReason?: 'password' | 'encryption';
}

const latin1 = new TextDecoder('latin1');
/** Readers look for the header in the first 1024 bytes (pdf.js, Acrobat). */
const HEADER_SEARCH = 1024;

/** Index of `%PDF-` (0 when absent: let the parser report it). */
function headerOffset(bytes: Uint8Array): number {
	const i = latin1.decode(bytes.subarray(0, HEADER_SEARCH)).indexOf('%PDF-');
	return Math.max(0, i);
}

/** The last `startxref` value. */
export function lastStartXref(bytes: Uint8Array): number | undefined {
	const tail = latin1.decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
	const all = [...tail.matchAll(/startxref\s+(\d+)/g)];
	const last = all.at(-1);
	return last ? Number(last[1]) : undefined;
}

/** Whether `offset` points at a cross-reference section (table or stream object). */
function xrefAt(bytes: Uint8Array, offset: number): 'table' | 'stream' | null {
	if (offset < 0 || offset >= bytes.length) return null;
	const head = latin1.decode(bytes.subarray(offset, offset + 32));
	if (/^\s*xref/.test(head)) return 'table';
	if (/^\s*\d+\s+\d+\s+obj/.test(head)) return 'stream';
	return null;
}

/** Whether the file's last cross-reference section is an xref stream (vs a classic table). */
export function lastXrefIsStream(bytes: Uint8Array): boolean {
	const at = lastStartXref(bytes);
	return at !== undefined && xrefAt(bytes, at) === 'stream';
}

/**
 * Drop bytes before `%PDF-`. Readers count offsets from the header in that
 * case, so the trimmed file is consistent and can take an incremental update.
 * When the offsets count from byte 0 instead (or can't be checked), trimming
 * breaks them: `offsetsValid` is false and the caller must rewrite the file.
 */
export function trimBeforeHeader(bytes: Uint8Array): { bytes: Uint8Array; offsetsValid: boolean } {
	const start = headerOffset(bytes);
	if (start === 0) return { bytes, offsetsValid: true };
	const at = lastStartXref(bytes);
	const trimmed = bytes.subarray(start);
	return { bytes: trimmed, offsetsValid: at !== undefined && xrefAt(trimmed, at) !== null };
}

/** pdf-lib's error when a file needs a (user) password. */
const NEEDS_PASSWORD = /NEEDS PASSWORD|incorrect password/i;

export class PdfSaveError extends Error {
	constructor(
		message: string,
		readonly reason: NonNullable<SaveSupport['saveBlockedReason']>,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'PdfSaveError';
	}
}

export interface OpenedPdf {
	doc: PDFDocument;
	/** The bytes pdf-lib parsed (header-aligned). */
	bytes: Uint8Array;
	/** The file was encrypted and is now decrypted: it must be saved as a full rewrite. */
	decrypted: boolean;
	/** An incremental update would be consistent with the file's offsets. */
	incremental: boolean;
}

/**
 * Load for writing. Throws `PdfSaveError` when the file can't be decrypted
 * (it needs a password to open).
 */
export async function openForWrite(
	input: Uint8Array | ArrayBuffer,
	incremental: boolean
): Promise<OpenedPdf> {
	const lib = await loadPdfLib();
	const { bytes, offsetsValid } = trimBeforeHeader(toBytes(input));
	let doc: PDFDocument;
	try {
		doc = await lib.PDFDocument.load(bytes, {
			forIncrementalUpdate: incremental && offsetsValid,
			updateMetadata: false,
			// Decrypts files with an empty user password; ignored for unencrypted files.
			password: ''
		});
	} catch (err) {
		const blocked = encryptionFailure(err);
		if (!blocked) throw err;
		throw new PdfSaveError(
			blocked === 'password'
				? 'svelte-pdf-mini: this PDF needs a password to open; saving annotations into it would remove that protection'
				: 'svelte-pdf-mini: this PDF uses an encryption pdf-lib cannot read',
			blocked,
			{ cause: err }
		);
	}
	const decrypted = doc.context.isDecrypted;
	return { doc, bytes, decrypted, incremental: incremental && offsetsValid && !decrypted };
}

/**
 * Load for reading: decrypted when possible (strings and embedded files of
 * encrypted files are unreadable otherwise), else with encryption ignored
 * (geometry still reads; text does not).
 */
export async function openForRead(
	input: Uint8Array | ArrayBuffer,
	password?: string
): Promise<{ doc: PDFDocument; support: SaveSupport }> {
	const lib = await loadPdfLib();
	const { bytes } = trimBeforeHeader(toBytes(input));
	try {
		const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false, password: '' });
		return { doc, support: { encrypted: doc.context.isDecrypted, canSave: true } };
	} catch (err) {
		const blocked = encryptionFailure(err);
		if (!blocked) throw err;
		const support: SaveSupport = { encrypted: true, canSave: false, saveBlockedReason: blocked };
		// With its password the text decrypts; saving stays blocked either way.
		if (password) {
			try {
				const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false, password });
				return { doc, support };
			} catch (retry) {
				if (!encryptionFailure(retry)) throw retry;
			}
		}
		const doc = await lib.PDFDocument.load(bytes, {
			updateMetadata: false,
			ignoreEncryption: true
		});
		return { doc, support };
	}
}

/**
 * Whether `exportPdf` can write this PDF. Cheap for unencrypted files (a
 * byte scan); encrypted ones are parsed once to try the empty password.
 */
export async function saveSupport(input: Uint8Array | ArrayBuffer): Promise<SaveSupport> {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	// The trailer (or xref stream dictionary) of an encrypted file names /Encrypt in plain text.
	if (!includesAscii(bytes, '/Encrypt')) return { encrypted: false, canSave: true };
	const lib = await loadPdfLib();
	try {
		const doc = await lib.PDFDocument.load(trimBeforeHeader(toBytes(bytes)).bytes, {
			updateMetadata: false,
			password: ''
		});
		return { encrypted: doc.context.isDecrypted, canSave: true };
	} catch (err) {
		const blocked = encryptionFailure(err);
		if (!blocked) throw err;
		return { encrypted: true, canSave: false, saveBlockedReason: blocked };
	}
}

/** The reason an encrypted file can't be opened, or null for other errors. */
function encryptionFailure(err: unknown): SaveSupport['saveBlockedReason'] | null {
	const message = err instanceof Error ? err.message : String(err);
	if (NEEDS_PASSWORD.test(message)) return 'password';
	if (/encryption|cipher|crypt/i.test(message)) return 'encryption';
	return null;
}

function includesAscii(bytes: Uint8Array, needle: string): boolean {
	const first = needle.charCodeAt(0);
	const last = bytes.length - needle.length;
	outer: for (
		let i = bytes.indexOf(first);
		i !== -1 && i <= last;
		i = bytes.indexOf(first, i + 1)
	) {
		for (let j = 1; j < needle.length; j++)
			if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
		return true;
	}
	return false;
}
