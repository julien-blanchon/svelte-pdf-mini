/**
 * Shared helpers for the PDF annotation codec: lazy pdf-lib loading, PDF
 * dates, colors, quad normalization and the private-data conventions.
 */
import type { Quad } from '../text/text-index.js';
import type { Annotation, FreeTextAnnotation, Rgb } from '../annotations/model.js';

export type PdfLib = typeof import('@cantoo/pdf-lib');

let pdfLibPromise: Promise<PdfLib> | null = null;

/** Import @cantoo/pdf-lib on first use, so plain viewers never load it. */
export function loadPdfLib(): Promise<PdfLib> {
	pdfLibPromise ??= import('@cantoo/pdf-lib');
	return pdfLibPromise;
}

/** Name of the embedded file holding the full model (keyed by annotation id). */
export const EMBEDDED_FILE_NAME = 'svelte-pdf-mini.json';
/** Private (second-class) annotation key with the fields PDF cannot express. */
export const PRIVATE_KEY = 'SPM_Data';
export const GENERATOR = 'svelte-pdf-mini';

/** Annotation flags (PDF 32000 §12.5.3). */
export const AnnotFlag = {
	Invisible: 1,
	Hidden: 2,
	Print: 4,
	NoZoom: 8,
	NoRotate: 16,
	NoView: 32,
	ReadOnly: 64,
	Locked: 128
} as const;

type TextAlign = NonNullable<FreeTextAnnotation['align']>;
type FontFamily = FreeTextAnnotation['font']['family'];

/** FreeText /Q quadding (PDF 32000 §12.7.4.3). */
export const QUADDING: Record<TextAlign, number> = { left: 0, center: 1, right: 2 };

/** Font resource names used in FreeText /DA strings. */
export const DA_FONT_NAMES: Record<FontFamily, string> = {
	Helvetica: 'Helv',
	Times: 'TiRo',
	Courier: 'Cour'
};

/** Alignment of a /Q value; left (0) and unknown values stay implicit. */
export function alignFromQuadding(q: number): 'center' | 'right' | undefined {
	if (q === QUADDING.center) return 'center';
	if (q === QUADDING.right) return 'right';
	return undefined;
}

/** Font family of a /DA font resource name ("TiRo", "Cour", "Helv"…). */
export function fontFamilyOf(fontName: string): FontFamily {
	if (/^(Ti|Times)/i.test(fontName)) return 'Times';
	if (/^Cour/i.test(fontName)) return 'Courier';
	return 'Helvetica';
}

export function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
	// Copy: pdf-lib may keep references and callers may reuse/transfer their buffer.
	return input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
}

/** ISO 8601 → PDF date string (UTC): D:YYYYMMDDHHmmSSZ */
export function toPdfDate(iso: string | undefined): string {
	const d = iso ? new Date(iso) : new Date();
	const t = Number.isNaN(d.getTime()) ? new Date() : d;
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return `D:${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}Z`;
}

/** PDF date string → ISO 8601 (undefined when unparseable). Accepts partial dates and offsets. */
export function fromPdfDate(s: string | undefined): string | undefined {
	if (!s) return undefined;
	const m =
		/^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?/.exec(
			s.trim()
		);
	if (!m) return undefined;
	const [, Y, Mo = '01', D = '01', H = '00', Mi = '00', S = '00', sign, oh = '00', om = '00'] = m;
	let ms = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
	if (sign === '+' || sign === '-') {
		const off = (+oh * 60 + +om) * 60_000;
		ms += sign === '+' ? -off : off;
	}
	return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/**
 * The `modifiedAt` an imported annotation gets: /M, else /CreationDate, else the
 * epoch. The writer compares against the same value to tell untouched imports.
 */
export function importedModifiedAt(m: string | undefined, creation: string | undefined): string {
	return fromPdfDate(m) ?? fromPdfDate(creation) ?? new Date(0).toISOString();
}

/** PDF color array (gray / RGB / CMYK) → Rgb. */
export function colorFromArray(values: number[] | undefined): Rgb | undefined {
	if (!values || !values.length) return undefined;
	if (values.length === 1) return [values[0], values[0], values[0]];
	if (values.length === 3) return [values[0], values[1], values[2]];
	if (values.length === 4) {
		const [c, m, y, k] = values;
		return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
	}
	return undefined;
}

/** Format a number for content streams / dicts (compact, finite). */
export function n(v: number): string {
	if (!Number.isFinite(v)) return '0';
	const r = Math.round(v * 1000) / 1000;
	return Object.is(r, -0) ? '0' : String(r);
}

/**
 * Bring a quad from any common ordering into Z order (TL, TR, BL, BR, y up).
 * Handles the spec's counter-clockwise order (BL, BR, TR, TL) and bottom-first
 * Z order; rotated quads keep their shape.
 */
export function normalizeQuad(q: number[]): Quad {
	let p = [
		[q[0], q[1]],
		[q[2], q[3]],
		[q[4], q[5]],
		[q[6], q[7]]
	];
	// Z order has p0→p1 parallel to p2→p3; a ring order (CCW/CW) has them opposite.
	const a = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
	const b = [p[3][0] - p[2][0], p[3][1] - p[2][1]];
	if (a[0] * b[0] + a[1] * b[1] < 0) p = [p[0], p[1], p[3], p[2]];
	// Top row first: right × down must be negative with y up.
	const right = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
	const down = [p[2][0] - p[0][0], p[2][1] - p[0][1]];
	if (right[0] * down[1] - right[1] * down[0] > 0) p = [p[2], p[3], p[0], p[1]];
	return [p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]];
}

/** Bounding box (x1,y1,x2,y2) of a flat list of points. */
export function boundsOf(points: [number, number][]): [number, number, number, number] {
	let x1 = Infinity,
		y1 = Infinity,
		x2 = -Infinity,
		y2 = -Infinity;
	for (const [x, y] of points) {
		if (x < x1) x1 = x;
		if (y < y1) y1 = y;
		if (x > x2) x2 = x;
		if (y > y2) y2 = y;
	}
	return [x1, y1, x2, y2];
}

/**
 * Fields stored in the private /SPM_Data key: everything the standard PDF
 * keys cannot express (or express lossily).
 */
export interface PrivateData {
	v: number;
	id: string;
	kind: Annotation['kind'];
	modifiedAt: string;
	createdAt: string;
	[key: string]: unknown;
}

/**
 * /SPM_Data holds the whole model except the page (re-serializers such as
 * Apple's PDFKit keep unknown keys but drop /NM, /M, /CA, /IRT and embedded
 * files, so the private copy must be self-sufficient).
 */
const STANDARD_KEYS = new Set(['page']);

export function privateDataOf(a: Annotation, schema: number): PrivateData {
	const out: Record<string, unknown> = { v: schema };
	for (const [k, v] of Object.entries(a)) {
		if (STANDARD_KEYS.has(k) || v === undefined) continue;
		out[k] = v;
	}
	return out as PrivateData;
}

/** Deep clone a JSON-safe value. */
export function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
