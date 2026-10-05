/**
 * Figures, tables and algorithms: captions from text ("Figure 3: …"), bodies
 * from image / form-XObject boxes or, failing that, from the empty-of-body-text
 * region next to the caption. hyperref `figure.*`/`table.*` targets are attached.
 */
import { cleanQuote } from '../text/text-index.js';
import type { PdfRect } from '../types.js';
import { distanceToRange } from '../view/geometry.js';
import { targetY, type DocContext } from './context.js';
import { lineRect, unionRect, type Line } from './lines.js';
import type { Figure, FigureKind } from './types.js';

const CAPTION =
	/^(Figure|Fig\.?|Table|Tab\.|Algorithm)\s*((?:\d+|[A-Z])(?:\.\d+)*|[IVX]+)\s*(:|\.(?!\d)|\||\s+[-–—]\s)/i;

const FIGURE_LABELS: Record<FigureKind, string> = {
	figure: 'Figure',
	table: 'Table',
	algorithm: 'Algorithm',
	equation: 'Equation'
};

/** Kind from a caption word ("Tab.", "Algorithm") or destination name ("table.3"). */
function figureKindOf(word: string): FigureKind {
	const w = word.toLowerCase();
	if (w.startsWith('tab')) return 'table';
	if (w.startsWith('alg')) return 'algorithm';
	return 'figure';
}

export async function extractFigures(
	ctx: DocContext,
	useImages: boolean,
	budgetMs = 2500
): Promise<Figure[]> {
	const figures: Figure[] = [];
	// Operator lists of plot-heavy pages are expensive: spend at most `budgetMs` on them.
	let spent = 0;
	const seen = new Set<string>();
	for (let p = 1; p <= ctx.numPages; p++) {
		const lines = ctx.lines[p - 1];
		const captions: { line: number; kind: FigureKind; number: string; labelRect?: PdfRect }[] = [];
		const text = ctx.texts[p - 1];
		lines.forEach((l, i) => {
			if (l.rotated) return;
			let m = CAPTION.exec(l.text.trim());
			// "TABLE 3 LoopCD-Hidden raises…": all-caps labels are never running text.
			m ??= /^(FIGURE|FIG\.?|TABLE|ALGORITHM)\s+((?:\d+|[A-Z])(?:\.\d+)*)\s+(?=\p{Lu})/u.exec(
				l.text.trim()
			);
			// "Figure 1 Dialogue process." (no colon): accept when the label is its own text item (bold run).
			if (!m) {
				const firstItem = text.items[text.itemAt(l.start)]?.str.trim() ?? '';
				const label = /^(Figure|Fig\.?|Table|Tab\.|Algorithm)\s*((?:\d+|[A-Z])(?:\.\d+)*)$/i.exec(
					firstItem
				);
				if (label && /^\s*\S+\s*\S+\s+\p{Lu}/u.test(l.text)) m = label;
			}
			if (!m) return;
			// "…are shown in\nTable 6. In this table…" is running text, not a caption.
			const prev = lines[i - 1];
			if (
				prev &&
				!prev.rotated &&
				Math.abs(prev.size - l.size) < 0.4 &&
				Math.abs(prev.x - l.x) < 24
			) {
				const h = l.top - l.bottom;
				const gap = prev.bottom - l.top;
				if (gap > -2 && gap < h * 0.6 && !/[.:;!?)\]]$/.test(prev.text.trim())) return;
			}
			const lead = l.text.length - l.text.trimStart().length;
			const labelEnd = l.start + lead + m[0].replace(/[\s:.|–—-]+$/, '').length;
			captions.push({
				line: i,
				kind: figureKindOf(m[1]),
				number: m[2],
				labelRect: text.rectFor(l.start + lead, labelEnd) ?? undefined
			});
		});
		if (!captions.length) continue;
		let graphics: Graphics = { images: [], rules: [], drawings: [] };
		if (useImages && spent < budgetMs) {
			const t0 = performance.now();
			if (ctx.src.getGraphics) graphics = await ctx.src.getGraphics(p).catch(() => graphics);
			else if (ctx.src.getImageBoxes)
				graphics = {
					images: await ctx.src.getImageBoxes(p).catch(() => []),
					rules: [],
					drawings: []
				};
			spent += performance.now() - t0;
		}
		const size = ctx.src.pageSize(p);
		const cols = pageColumns(ctx, p);
		const blocks = captions.map((c) => {
			const capLines = captionLines(ctx, lines, c.line);
			return { c, capLines, rect: unionRect(capLines.map(lineRect))! };
		});
		const noGraphics =
			!graphics.images.length && !graphics.drawings.length && !graphics.rules.length;
		for (const { c, capLines, rect: captionRect } of blocks) {
			const key = `${c.kind}:${c.number}`;
			if (seen.has(key)) continue;
			const caption = cleanQuote(capLines.map((l) => l.text).join('\n'));
			// Captions that are really prose ("Figure 1. shows…") are short-lived; require some length.
			if (caption.length < 8) continue;
			// Other captions' lines: a region never crosses them.
			const others = new Map<Line, FigureKind>();
			for (const o of blocks)
				if (o.capLines !== capLines) for (const l of o.capLines) others.set(l, o.c.kind);
			const textCol = columnFor(cols, captionRect);
			const column = besideText(lines, capLines, textCol) ?? subColumn(textCol, captionRect);
			const found = regionBody(ctx, lines, capLines, others, graphics, column, {
				halfColumn:
					column !== textCol || (cols.length === 2 && column[1] - column[0] < size.width * 0.6),
				noGraphics,
				kind: c.kind,
				size
			});
			const body = found?.rect ?? null;
			const source: Figure['source'] = found?.graphics ? 'images' : 'layout';
			seen.add(key);
			figures.push({
				id: `${c.kind}-${c.number}`,
				kind: c.kind,
				number: c.number,
				label: `${FIGURE_LABELS[c.kind]} ${c.number}`,
				caption,
				page: p,
				captionRect,
				labelRect: c.labelRect,
				// Widened to the text column only: a half-column (side-by-side, wrapped figures)
				// sits next to other content.
				rect: frame(unionRect([captionRect, ...(body ? [body] : [])])!, column, size, {
					minShare: column === textCol ? 0.6 : Infinity
				}),
				source
			});
		}
	}
	await attachDests(ctx, figures);
	return figures;
}

/** Equation number at the end of a line: "(3)", "(2.1)", "(4a)" — not years or table values. */
const EQ_NUMBER = /\((\d{1,3}(?:\.\d{1,3})?[a-z]?)\)\s*$/;
// Not "(0.5)", "(2.0)", nor speed-ups like "(13x)" (a "×" read as "x").
const isEqNumber = (n: string) => !/^0\.|\.0$|x$/.test(n);

function median(values: number[]): number {
	const v = [...values].sort((a, b) => a - b);
	return v.length ? v[Math.floor(v.length / 2)] : 0;
}

/** Lines sharing a baseline band: one visual row of a page (math is split into many lines). */
interface Row {
	lines: Line[];
	rect: PdfRect;
	/** Middle of the row (y). */
	mid: number;
	text: string;
}

/** Group lines into rows: lines that overlap vertically by most of the smaller one. */
function rowsOf(lines: Line[]): Row[] {
	const rows: Row[] = [];
	for (const l of [...lines].sort((a, b) => b.top - a.top)) {
		const r = lineRect(l);
		const row = rows.find((w) => {
			// Same baseline (a line split by inline math), or a smaller piece (a script)
			// mostly inside the row. A full-size line on another baseline is another row,
			// however tall this one is (fractions).
			if (
				w.lines.some(
					(x) =>
						Math.abs(x.y - l.y) < Math.min(x.size, l.size) * 0.3 && Math.abs(x.size - l.size) < 1.5
				)
			)
				return true;
			if (l.size > Math.max(...w.lines.map((x) => x.size)) * 0.85) return false;
			const overlap = Math.min(w.rect[3], r[3]) - Math.max(w.rect[1], r[1]);
			return overlap > (r[3] - r[1]) * 0.6;
		});
		if (row) {
			row.lines.push(l);
			row.rect = unionRect([row.rect, r])!;
		} else rows.push({ lines: [l], rect: r, mid: 0, text: '' });
	}
	for (const w of rows) {
		w.lines.sort((a, b) => a.x - b.x);
		w.mid = (w.rect[1] + w.rect[3]) / 2;
		w.text = w.lines.map((l) => l.text).join(' ');
	}
	return rows.sort((a, b) => b.mid - a.mid);
}

/** Words of running text in a row ("where", "and" between formulas are not enough). */
const proseWords = (text: string) =>
	text.match(/(?<![\p{L}\d_^])[a-z]{3,}(?![\p{L}\d_(])/gu)?.filter((w) => w !== 'where').length ??
	0;

/**
 * Numbered display equations (LaTeX `equation`, `align`): a line ending in "(3)"
 * where the number sits well apart from the formula (the right-margin number,
 * not "… in Eq. (3)" prose). The equation is the run of math rows around the
 * number's row, up to running text, headings, captions or another numbered row
 * (rows between two numbered rows go to the nearer one), as wide as its column.
 */
export function extractEquations(
	ctx: DocContext,
	excluded: (page: number, offset: number) => boolean
): Figure[] {
	const out: Figure[] = [];
	const seen = new Set<string>();
	for (let p = 1; p <= ctx.numPages; p++) {
		const lines = ctx.lines[p - 1];
		const text = ctx.texts[p - 1];
		const size = ctx.src.pageSize(p);
		const band = Math.max(36, size.height * 0.06);
		const cols = pageColumns(ctx, p);
		/** The equation numbers on this page, by row. */
		const numbered = new Map<
			Row,
			{ line: Line; number: string; numRect: PdfRect; bodyText: string }
		>();
		const candidates: { line: Line; number: string; numRect: PdfRect; bodyText: string }[] = [];
		for (const l of lines) {
			if (l.rotated) continue;
			const m = EQ_NUMBER.exec(l.text);
			if (!m || !isEqNumber(m[1]) || excluded(p, l.start)) continue;
			const numStart = l.start + m.index;
			const numRect = text.rectFor(numStart, numStart + m[0].trimEnd().length);
			if (!numRect || !numRect.every(Number.isFinite)) continue;
			const bodyText = l.text.slice(0, m.index).trimEnd();
			// Table rows: several parenthesised values on the line.
			if (/\(\d+(?:\.\d+)?\)/.test(bodyText)) continue;
			const bodyRect = bodyText ? text.rectFor(l.start, l.start + bodyText.length) : null;
			// Set apart: a wide gap before the number (or the number alone on its line).
			if (bodyRect && numRect[0] - bodyRect[2] < l.size * 1.5) continue;
			// Prose ending a sentence right before the number is a reference, not an equation.
			if (/\b[a-z]{3,}[.,;:]?$/.test(bodyText) && !/[=+\-−·×<>≤≥∈)\]}]/.test(bodyText)) continue;
			candidates.push({ line: l, number: m[1], numRect, bodyText });
		}
		if (!candidates.length) continue;
		for (const [col, group] of groupByColumn(cols, candidates)) {
			const colLines = lines.filter((x) => {
				const r = lineRect(x);
				if (!r.every(Number.isFinite)) return false;
				if (group.some((c) => c.line === x)) return true;
				if (x.rotated) return false;
				if (r[1] > size.height - band || r[3] < band) return false;
				return Math.min(r[2], col[1] + 4) - Math.max(r[0], col[0] - 4) > (r[2] - r[0]) * 0.5;
			});
			const rows = rowsOf(colLines);
			const rowOf = (l: Line) => rows.find((w) => w.lines.includes(l))!;
			for (const c of group) numbered.set(rowOf(c.line), c);
			const colW = col[1] - col[0];
			/** Running text, a heading or a caption: never part of an equation. */
			const isText = (w: Row) => {
				const words = proseWords(w.text);
				return (
					CAPTION.test(w.text.trim()) ||
					w.lines.some((x) => isHeadingLine(ctx, x)) ||
					(words >= 3 && w.rect[2] - w.rect[0] > colW * 0.5) ||
					words >= 6 ||
					// "…, we can write:" / "when conditioned on x₀:" introduce the equation.
					(words >= 1 && /:$/.test(w.text.trim())) ||
					// Display math is indented or centered; text starts at the column's edge.
					(words >= 1 && w.rect[0] <= col[0] + ctx.body)
				);
			};
			for (const c of group) {
				if (seen.has(c.number)) continue;
				const own = rowOf(c.line);
				const i = rows.indexOf(own);
				const body: Row[] = [own];
				/** The running-text rows that ended the growth (above, below): never covered. */
				let [ceil, floor] = [Infinity, -Infinity];
				// Grow up then down over math rows, row by row.
				for (const dir of [-1, 1]) {
					let edge = own;
					for (let k = i + dir; k >= 0 && k < rows.length; k += dir) {
						const w = rows[k];
						const gap = dir < 0 ? w.rect[1] - edge.rect[3] : edge.rect[1] - w.rect[3];
						if (gap > c.line.size * 1.2) break;
						if (isText(w)) {
							// Tall delimiters' boxes reach over the text next to the formula: stop at
							// that text's ink (font boxes include generous ascent / descent).
							const main = w.lines.reduce((a, x) => (x.size > a.size ? x : a));
							if (dir < 0) ceil = main.y - main.size * 0.2;
							else floor = main.y + main.size * 0.7;
							break;
						}
						const other = numbered.get(w);
						if (other && other !== c) break;
						// Between two numbered rows, a row goes to the nearer one.
						const next = rows.slice(k).find((x) => numbered.has(x) && x !== own);
						const prev = rows
							.slice(0, k + 1)
							.reverse()
							.find((x) => numbered.has(x) && x !== own);
						const rival = dir > 0 ? next : prev;
						if (rival && Math.abs(rival.mid - w.mid) < Math.abs(own.mid - w.mid)) break;
						body.push(w);
						edge = w;
					}
				}
				body.sort((a, b) => b.mid - a.mid);
				seen.add(c.number);
				const all = unionRect([c.numRect, ...body.map((w) => w.rect)])!;
				const rect: PdfRect = [all[0], Math.max(all[1], floor), all[2], Math.min(all[3], ceil)];
				out.push({
					id: `equation-${c.number}`,
					kind: 'equation',
					number: c.number,
					label: `Equation ${c.number}`,
					caption: cleanQuote(
						body
							.map((w) => (w === own ? w.text.replace(EQ_NUMBER, '').trimEnd() : w.text))
							.join('\n')
					),
					page: p,
					captionRect: c.numRect,
					labelRect: c.numRect,
					// Display math spans its column: the whole width, so nothing is cut.
					rect: clampY(frame(rect, col, size, { minShare: 0, pad: 2 }), floor, ceil),
					source: 'layout'
				});
			}
		}
	}
	return out;
}

const clampY = (r: PdfRect, floor: number, ceil: number): PdfRect => [
	r[0],
	Math.max(r[1], floor),
	r[2],
	Math.min(r[3], ceil)
];

/** Equation numbers grouped by the text column they sit in. */
function groupByColumn<T extends { numRect: PdfRect }>(
	cols: TextColumns,
	items: T[]
): Map<[number, number], T[]> {
	const out = new Map<[number, number], T[]>();
	for (const it of items) {
		const col = columnFor(cols, it.numRect);
		const key = cols.find((c) => c[0] === col[0] && c[1] === col[1]) ?? col;
		out.set(key, [...(out.get(key) ?? []), it]);
	}
	return out;
}

/** The caption's lines: the label line plus following lines of the same block. */
function captionLines(ctx: DocContext, lines: Line[], i: number): Line[] {
	const out = [lines[i]];
	for (let j = i + 1; j < lines.length && out.length < 14; j++) {
		const prev = out[out.length - 1];
		const l = lines[j];
		// Another caption, or an algorithm's first step ("1: repeat") under its header.
		if (l.rotated || CAPTION.test(l.text.trim()) || /^\d{1,3}:\s/.test(l.text.trim())) break;
		// Baseline distance vs. font size (line boxes can be unreliable: some fonts report tiny ascents).
		const lead = prev.y - l.y;
		if (lead > prev.size * 1.75 || lead < -prev.size) break; // paragraph break / column jump
		if (Math.abs(l.size - prev.size) > 1) break;
		// Table rows / plot labels right under a caption are not caption text.
		const words = l.text.trim().split(/\s+/);
		const numeric = words.filter((w) => /^[-+±]?[\d.,%×()]+$/.test(w)).length;
		if (numeric / words.length > 0.3) break;
		if (/[.:]$/.test(prev.text.trim()) && words.length < 4) break;
		if (l.x < out[0].x - 30 || l.x > out[0].x + 60) break;
		out.push(l);
	}
	return out;
}

/** A page's text block: one column, or a left and a right one (left / right text edges). */
export type TextColumns = [number, number][];

const columnsCache = new WeakMap<DocContext, Map<number, TextColumns | null>>();

/**
 * A page's text columns; for a page without running text (a full-page figure),
 * the nearest page's that has some.
 */
export function pageColumns(ctx: DocContext, page: number): TextColumns {
	let cache = columnsCache.get(ctx);
	if (!cache) columnsCache.set(ctx, (cache = new Map()));
	const of = (p: number) => {
		if (!cache.has(p)) cache.set(p, textColumns(ctx.lines[p - 1], ctx.body, ctx.src.pageSize(p)));
		return cache.get(p)!;
	};
	for (let d = 0; d < ctx.numPages; d++)
		for (const p of [page - d, page + d]) if (p >= 1 && p <= ctx.numPages && of(p)) return of(p)!;
	const { width } = ctx.src.pageSize(page);
	return [[width * 0.1, width * 0.9]];
}

/** Text columns from a page's running-text lines (median left / right edges); null without enough text. */
export function textColumns(
	lines: Line[],
	body: number,
	size: { width: number; height: number }
): TextColumns | null {
	const band = Math.max(36, size.height * 0.06);
	const prose = lines.filter(
		(l) =>
			!l.rotated &&
			Math.abs(l.size - body) < 1 &&
			l.y > band &&
			l.y < size.height - band &&
			isProse(l.text)
	);
	const block = (ls: Line[]): [number, number] => [
		median(ls.map((l) => l.x)),
		median(ls.map((l) => l.right))
	];
	if (prose.length < 3) return null;
	const wide = prose.filter((l) => l.right - l.x > size.width * 0.55);
	if (wide.length >= prose.length * 0.4) return [block(wide)];
	const mid = size.width / 2;
	const left = prose.filter((l) => l.right < mid + 10);
	const right = prose.filter((l) => l.x > mid - 10);
	if (left.length < 2 || right.length < 2) return [block(prose)];
	return [block(left), block(right)];
}

/**
 * Wrapped figures and tables (`wrapfigure`): running text beside the caption, on
 * its own rows, leaves the region the rest of the column.
 */
function besideText(
	lines: Line[],
	capLines: Line[],
	col: [number, number]
): [number, number] | null {
	const cap = unionRect(capLines.map(lineRect))!;
	const first = capLines[0];
	const beside = lines.filter(
		(l) =>
			!l.rotated &&
			!capLines.includes(l) &&
			Math.abs(l.y - first.y) < first.size * 0.5 &&
			(l.right < cap[0] - 4 || l.x > cap[2] + 4) &&
			l.x >= col[0] - 4 &&
			l.right <= col[1] + 4 &&
			l.right - l.x > (col[1] - col[0]) * 0.25
	);
	if (!beside.length) return null;
	const left = beside.filter((l) => l.right < cap[0]);
	const right = beside.filter((l) => l.x > cap[2]);
	if (left.length) return [Math.max(...left.map((l) => l.right)) + 4, col[1]];
	return [col[0], Math.min(...right.map((l) => l.x)) - 4];
}

/**
 * Side-by-side figures (minipages): a short caption (almost) within one half of
 * its column captions that half only. A caption across the middle, or a long one,
 * captions the whole column.
 */
function subColumn(col: [number, number], cap: PdfRect): [number, number] {
	const w = col[1] - col[0];
	const mid = (col[0] + col[1]) / 2;
	const capW = Math.max(1, cap[2] - cap[0]);
	if (capW > w * 0.55) return col;
	if (Math.min(cap[2], mid) - cap[0] >= capW * 0.85) return [col[0], mid + 5];
	if (cap[2] - Math.max(cap[0], mid) >= capW * 0.85) return [mid - 5, col[1]];
	return col;
}

/** The column a box sits in: the whole text block when it spans both columns. */
export function columnFor(cols: TextColumns, r: PdfRect): [number, number] {
	if (cols.length === 1) return cols[0];
	const [a, b] = cols;
	const gutter = (a[1] + b[0]) / 2;
	if (r[0] < gutter - 15 && r[2] > gutter + 15) return [a[0], b[1]];
	return (r[0] + r[2]) / 2 < gutter ? a : b;
}

interface Graphics {
	images: PdfRect[];
	rules: PdfRect[];
	drawings: PdfRect[];
}

const STOPWORDS = new Set(
	'the of and to in a is for we that with on are by as this be from an which our it at can these not or has have was were their its than such also into when where while both each more most other only between using use used then there however our'.split(
		' '
	)
);

/** A running-text line (prose), as opposed to figure labels or table rows. */
function isProse(text: string): boolean {
	const words = text.trim().split(/\s+/);
	if (words.length < 6) return false;
	let stop = 0;
	let numeric = 0;
	for (const w of words) {
		const k = w.toLowerCase().replace(/[^\p{L}]/gu, '');
		if (STOPWORDS.has(k)) stop++;
		if (/^[-+±]?[\d.,%×()]+$/.test(w)) numeric++;
	}
	return stop >= 2 && numeric / words.length < 0.3;
}

const isHeadingLine = (ctx: DocContext, l: Line) =>
	/^((?:\d{1,2}|[A-Z])(?:\.\d{1,2}){0,3})\.?\s+\p{Lu}/u.test(l.text.trim()) &&
	l.size >= ctx.body - 0.2 &&
	l.text.trim().split(/\s+/).length <= 12 &&
	!/[.:]$/.test(l.text.trim());

/** Is `inner` inside `outer`, give or take `slack` pt? */
function containedIn(inner: PdfRect, outer: PdfRect, slack = 2): boolean {
	return (
		inner[0] >= outer[0] - slack &&
		inner[2] <= outer[2] + slack &&
		inner[1] >= outer[1] - slack &&
		inner[3] <= outer[3] + slack
	);
}

interface RegionItem {
	r: PdfRect;
	graphic: boolean;
	rule: boolean;
	/** Running text / heading / caption: ends the region unless it is panel text. */
	stop: boolean;
	/** Text inside a graphic box. */
	inner: boolean;
	/** Another figure's caption (its kind). */
	caption?: FigureKind;
	heading?: boolean;
	/** Text that is not running text (labels, table rows). */
	short?: boolean;
	/** Text at body size (not a note or label). */
	body?: boolean;
	/** Starts like a numbered heading. */
	numbered?: boolean;
}

/** Largest gap (pt) that still joins an item to the region: graphics bridge more than rules, rules more than text. */
function maxGapFor(it: RegionItem): number {
	if (it.graphic || it.inner) return 48;
	if (it.rule) return 30;
	return 22;
}

/** Evidence weight of a region item when comparing both sides of a caption. */
function itemWeight(it: RegionItem): number {
	if (it.graphic) return 3;
	if (it.rule) return 2;
	return 1;
}

/**
 * A region's final box: as wide as its text column when it nearly is (plots and
 * tables often stop short of the margins; cutting them reads as a bug, a little
 * margin doesn't), with some breathing room.
 */
export function frame(
	r: PdfRect,
	col: [number, number],
	size: { width: number; height: number },
	{ minShare = 0.6, pad = 4 } = {}
): PdfRect {
	let [x1, , x2] = r;
	if (x2 - x1 >= (col[1] - col[0]) * minShare) {
		x1 = Math.min(x1, col[0]);
		x2 = Math.max(x2, col[1]);
	}
	return [
		Math.max(0, x1 - pad),
		Math.max(0, r[1] - pad),
		Math.min(size.width, x2 + pad),
		Math.min(size.height, r[3] + pad)
	];
}

interface RegionOptions {
	/** The caption's column is one of two (graphics are clipped to it). */
	halfColumn: boolean;
	/** No graphics known for the page (none, or not computed): fall back to blank space. */
	noGraphics: boolean;
	kind: FigureKind;
	size: { width: number; height: number };
}

/**
 * Walk away from the caption (above or below) absorbing graphics (images,
 * vector drawings, rules) and non-prose text lines that touch the growing
 * region, until running text, a heading, another caption or a big gap.
 * Both sides are tried; the expected side wins unless the other has clearly
 * more evidence (tables: rules right next to the caption). What lies against
 * another caption on the side that caption expects its body belongs to it.
 */
function regionBody(
	ctx: DocContext,
	lines: Line[],
	capLines: Line[],
	others: Map<Line, FigureKind>,
	graphics: Graphics,
	col: [number, number],
	{ halfColumn, noGraphics, kind, size }: RegionOptions
): { rect: PdfRect; graphics: boolean } | null {
	const cap = unionRect(capLines.map(lineRect))!;
	const capSpan: [number, number] = [Math.min(cap[0], col[0] + 4), Math.max(cap[2], col[1] - 4)];
	const xOverlap = (r: PdfRect, span: [number, number]) =>
		Math.max(0, Math.min(r[2], span[1]) - Math.max(r[0], span[0])) /
		Math.max(1, Math.min(r[2] - r[0], span[1] - span[0]));
	// Running headers / footers (and their rules) are never part of a figure.
	const band = Math.max(36, size.height * 0.06);
	const inMargin = (r: PdfRect) => r[1] > size.height - band || r[3] < band;
	const colW = col[1] - col[0];
	// Form XObjects often have a page-wide bbox while the plot sits in one column:
	// clip graphics to the caption's column (when the caption is a column caption) and to the margins.
	const clip = (r: PdfRect): PdfRect => [
		halfColumn ? Math.max(r[0], col[0] - 6) : r[0],
		Math.max(r[1], band),
		halfColumn ? Math.min(r[2], col[1] + 6) : r[2],
		Math.min(r[3], size.height - band)
	];
	// Vector "drawings" that hold running text are background panels (abstract boxes,
	// callouts), not figures: ignore them.
	const proseIn = (r: PdfRect) =>
		lines.filter((l) => {
			return (
				!l.rotated && containedIn(lineRect(l), r) && l.size >= ctx.body - 0.6 && isProse(l.text)
			);
		}).length;
	const boxes = [
		// Thin vertical strips (page decorations, margin bars) are not figures.
		...graphics.images
			.filter((r) => !(r[2] - r[0] < colW * 0.15 && r[3] - r[1] > (r[2] - r[0]) * 5))
			.map((r) => ({ r: clip(r), w: 2 })),
		...graphics.drawings.filter((r) => proseIn(r) < 3).map((r) => ({ r: clip(r), w: 2 })),
		// Side-by-side tables' rules often overhang the middle of the column.
		...graphics.rules
			.filter((r) => !inMargin(r) && r[2] - r[0] < colW * (halfColumn ? 1.3 : 1.15))
			.map((r) => ({ r, w: 1 }))
	].filter(
		({ r, w }) =>
			r[2] > r[0] &&
			r[3] > r[1] &&
			(w === 1 ? xOverlap(r, col) > 0.6 : xOverlap(r, capSpan) > 0.3) &&
			r[3] - r[1] < size.height * 0.92
	);
	const text = lines.filter(
		(l) =>
			!l.rotated &&
			lineRect(l).every(Number.isFinite) &&
			!capLines.includes(l) &&
			!inMargin(lineRect(l)) &&
			xOverlap(lineRect(l), col) > 0.5
	);
	const insideAny = (r: PdfRect) => boxes.some(({ r: b, w }) => w === 2 && containedIn(r, b));

	const walk = (above: boolean) => {
		const items: RegionItem[] = [
			...boxes.map(({ r, w }) => ({
				r,
				graphic: w === 2,
				rule: w === 1,
				stop: false,
				inner: false
			})),
			...text.map((l) => {
				const r = lineRect(l);
				const inner = insideAny(r);
				const caption = others.get(l);
				// Smaller text (sub-captions, table cells, plot labels) and "(a) …" sub-captions never end a region.
				const runningText =
					l.size >= ctx.body - 0.6 && !/^\(?[a-z]\)\s/.test(l.text.trim()) && isProse(l.text);
				const heading = isHeadingLine(ctx, l);
				const stop = !!caption || (!inner && (runningText || heading));
				return {
					r,
					graphic: false,
					rule: false,
					stop,
					inner,
					caption,
					heading,
					short: !isProse(l.text),
					body: l.size >= ctx.body - 0.6,
					// "B.4 Inference for Table 1", in any size (small caps headings).
					numbered: /^((?:\d{1,2}|[A-Z])(?:\.\d{1,2}){1,3})\.?\s+\p{Lu}/u.test(l.text.trim())
				};
			})
		].filter(({ r }) => (above ? r[1] >= cap[3] - 3 : r[3] <= cap[1] + 3));
		// Nearest edge first.
		items.sort((a, b) => (above ? a.r[1] - b.r[1] : b.r[3] - a.r[3]));
		let frontier = above ? cap[3] : cap[1];
		const taken: (RegionItem & { gap: number })[] = [];
		let firstGap = Infinity;
		/** Another caption the region ran into (its kind), if any. */
		let blockedBy: FigureKind | undefined;
		const nearOf = (it: RegionItem) => (above ? it.r[1] : it.r[3]);
		const farOf = (it: RegionItem) => (above ? it.r[3] : it.r[1]);
		/** Distance from an edge at `from` to an item, walking away from the caption. */
		const gapFrom = (from: number, it: RegionItem) =>
			above ? nearOf(it) - from : from - nearOf(it);
		for (let k = 0; k < items.length; k++) {
			const it = items[k];
			const far = farOf(it);
			const gap = gapFrom(frontier, it);
			// No graphics known: unseen images fill the gaps between a figure's labels.
			const maxGap = noGraphics && kind === 'figure' && !it.stop ? 72 : maxGapFor(it);
			if (gap > maxGap) {
				// Items fully covered by what we have are fine, and so are labels a bit too far
				// (sub-captions under plots): a graphic past them may still join. Anything else
				// ends the region.
				if (taken.length && (above ? far <= frontier : far >= frontier)) continue;
				if (!it.graphic && !it.rule && !it.stop && gap <= 48) continue;
				break;
			}
			if (it.caption) {
				blockedBy = it.caption;
				break;
			}
			if (it.stop) {
				// A short block of text followed closely by more graphics is panel text
				// ("Goal: …" under each image), not the running text around the figure.
				let end = frontier;
				let j = k;
				let blockLines = 0;
				while (j < items.length && !items[j].graphic && !items[j].rule) {
					const g = gapFrom(end, items[j]);
					if (g > 14) break;
					end = above ? Math.max(end, farOf(items[j])) : Math.min(end, farOf(items[j]));
					blockLines++;
					j++;
				}
				const next = items[j];
				const blockH = Math.abs(end - frontier);
				const nextGap = next ? gapFrom(end, next) : Infinity;
				// Headings and captions always end the region; so does text followed only by a
				// short rule (a fraction bar, an underline), which is no figure.
				const isPanelText =
					!!next &&
					(next.graphic || (next.rule && next.r[2] - next.r[0] >= colW * 0.4)) &&
					nextGap <= 30 &&
					blockLines <= 8 &&
					blockH <= 100 &&
					items.slice(k, j).every((x) => !x.heading && !x.caption);
				if (!isPanelText) break;
				for (const x of items.slice(k, j)) taken.push({ ...x, stop: false, gap: 0 });
				frontier = end;
				k = j - 1;
				continue;
			}
			if (!taken.length) firstGap = Math.max(0, gap);
			taken.push({ ...it, gap: Math.max(0, gap) });
			frontier = above ? Math.max(frontier, far) : Math.min(frontier, far);
		}
		// Ran down into a figure's caption: the graphics right above it are that figure
		// (tables and algorithms head their body, so they claim nothing; text claims
		// nothing either: an algorithm inside a figure stays the algorithm's). Keep what
		// lies before it: cut where a graphic follows other content after the widest gap.
		let claimed = taken;
		if (blockedBy === 'figure' && !above && taken.some((t) => t.graphic)) {
			let cut = -1;
			for (let k = 1; k < taken.length; k++)
				if (taken[k].graphic && !taken[k - 1].graphic && (cut < 0 || taken[k].gap > taken[cut].gap))
					cut = k;
			claimed = cut > 0 ? taken.slice(0, cut) : [];
		}
		if (!claimed.length) return null;
		const hasGraphics = claimed.some((t) => t.graphic);
		// With graphics, stray text beyond them (a paragraph's short last line) is not part of
		// the figure; short labels a bit further (panel titles above plots) are.
		let kept: RegionItem[] = claimed;
		if (hasGraphics) {
			const g = unionRect(claimed.filter((t) => t.graphic || t.rule).map((t) => t.r))!;
			kept = claimed.filter((t) => {
				const reach = t.short ? 24 : 14;
				return t.graphic || t.rule || (above ? t.r[3] <= g[3] + reach : t.r[1] >= g[1] - reach);
			});
		}
		// Tables and algorithms close with a wide rule: body-size text past the last one is
		// the paragraph after them (smaller table notes stay).
		const wide = kept.filter((t) => t.rule && t.r[2] - t.r[0] >= colW * 0.6);
		if ((kind === 'table' || kind === 'algorithm') && wide.length >= 2) {
			const last = above
				? Math.max(...wide.map((t) => t.r[3]))
				: Math.min(...wide.map((t) => t.r[1]));
			const wideRules = new Set(wide);
			// Inline math of that paragraph is smaller: judge text by its row.
			const onBodyRow = (r: PdfRect) =>
				text.some((l) => {
					const o = Math.min(l.top, r[3]) - Math.max(l.bottom, r[1]);
					return l.size >= ctx.body - 0.6 && o > Math.min(l.top - l.bottom, r[3] - r[1]) * 0.5;
				});
			kept = kept.filter(
				(t) =>
					t.graphic ||
					wideRules.has(t) ||
					(above ? t.r[1] < last : t.r[3] > last) ||
					(!t.rule && !t.body && !t.numbered && !onBodyRow(t.r))
			);
		}
		const rect = unionRect(kept.map((t) => t.r))!;
		const extent = above ? rect[3] - cap[3] : cap[1] - rect[1];
		if (extent < 10) return null;
		const rules = kept.filter((t) => t.rule).length;
		const score =
			kept.reduce((a, t) => a + itemWeight(t), 0) +
			(firstGap < 20 ? 2 : 0) +
			(kind === 'table' && rules >= 2 ? 6 : 0);
		return { rect, graphics: hasGraphics, score, rules, blockedBy };
	};

	/**
	 * No graphics known (a raster figure on a page past the time budget): the blank
	 * band between the caption and the nearest text on the expected side.
	 */
	const blank = (above: boolean, from: number): PdfRect | null => {
		const edges = text
			.map(lineRect)
			.filter((r) => (above ? r[1] >= from - 3 : r[3] <= from + 3))
			.map((r) => (above ? r[1] : r[3]));
		const end = above ? Math.min(size.height - band, ...edges) : Math.max(band, ...edges);
		const h = above ? end - from : from - end;
		if (h < 40 || h > size.height * 0.7) return null;
		return above ? [col[0], from, col[1], end - 2] : [col[0], end + 2, col[1], from];
	};

	const up = walk(true);
	const down = walk(false);
	// Expected side: figures above the caption; tables and algorithms (whose caption is
	// their header) below, though many templates put tables above.
	const preferred = kind === 'figure' ? up : down;
	const other = preferred === up ? down : up;
	let pick = preferred;
	if (!pick || (other && other.score > pick.score * 1.6 + 2)) pick = other ?? pick;
	// Tables: rules on exactly one side decide.
	if (kind === 'table' && up && down) {
		const upRuled = up.rules >= 2;
		const downRuled = down.rules >= 2;
		if (upRuled && !downRuled) pick = up;
		else if (downRuled && !upRuled) pick = down;
		// Both ruled, and the table below runs into the next table's caption: that one is
		// captioned underneath, and so is this one (one template per paper).
		else if (upRuled && down.blockedBy === 'table') pick = up;
	}
	// No graphics known: a figure is the blank band past what text was found (sub-captions,
	// axis labels) on its side.
	if (noGraphics && kind === 'figure') {
		const found = up?.rect;
		const band = blank(true, found ? found[3] : cap[3]);
		if (band) return { rect: found ? unionRect([found, band])! : band, graphics: false };
	}
	if (!pick) return null;
	// Never return (almost) the whole page.
	const [x1, y1, x2, y2] = pick.rect;
	if ((x2 - x1) * (y2 - y1) > size.width * size.height * 0.85) return null;
	return { rect: pick.rect, graphics: pick.graphics };
}

/** Attach hyperref figure/table destinations to the nearest figure on the target page. */
async function attachDests(ctx: DocContext, figures: Figure[]) {
	const seen = new Set<string>();
	for (const links of ctx.links)
		for (const link of links) {
			const d = link.dest;
			if (typeof d !== 'string' || seen.has(d) || !/^(figure|table|algorithm|algocf)\./.test(d))
				continue;
			seen.add(d);
			const t = await ctx.resolve(d);
			if (!t) continue;
			const best = nearestFigure(figures, t.page, targetY(t), figureKindOf(d), 120);
			if (best && !best.dest) best.dest = d;
		}
}

/** The figure of `kind` on `page` vertically closest to `y`, if closer than `maxDist` (pt). */
export function nearestFigure(
	figures: Figure[],
	page: number,
	y: number,
	kind: FigureKind,
	maxDist: number
): Figure | undefined {
	let best: Figure | undefined;
	let bestD = Infinity;
	for (const f of figures) {
		if (f.page !== page || f.kind !== kind) continue;
		const d = distanceToRange(y, f.rect[1], f.rect[3]);
		if (d < bestD) {
			bestD = d;
			best = f;
		}
	}
	return bestD < maxDist ? best : undefined;
}
