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
		const captionLineSet = new Set(captions.map((c) => lines[c.line]));
		const size = ctx.src.pageSize(p);
		for (const c of captions) {
			const key = `${c.kind}:${c.number}`;
			if (seen.has(key)) continue;
			const capLines = captionLines(ctx, lines, c.line);
			const captionRect = unionRect(capLines.map(lineRect))!;
			const caption = cleanQuote(capLines.map((l) => l.text).join('\n'));
			// Captions that are really prose ("Figure 1. shows…") are short-lived; require some length.
			if (caption.length < 8) continue;
			const column = columnOf(captionRect, size.width);
			const found = regionBody(
				ctx,
				lines,
				capLines,
				captionLineSet,
				graphics,
				column,
				c.kind,
				size
			);
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
				rect: unionRect([captionRect, ...(body ? [body] : [])])!,
				source
			});
		}
	}
	await attachDests(ctx, figures);
	return figures;
}

/** Equation number at the end of a line: "(3)", "(2.1)", "(4a)" — not years or table values. */
const EQ_NUMBER = /\((\d{1,3}(?:\.\d{1,3})?[a-z]?)\)\s*$/;
const isEqNumber = (n: string) => !/^0\.|\.0$/.test(n);

function median(values: number[]): number {
	const v = [...values].sort((a, b) => a - b);
	return v.length ? v[Math.floor(v.length / 2)] : 0;
}

/**
 * Numbered display equations (LaTeX `equation`): a line ending in "(3)" where
 * the number sits well apart from the formula (the right-margin number, not
 * "… in Eq. (3)" prose). The box grows over the formula's other lines:
 * fraction / sub- and superscript lines overlapping it, and adjacent
 * narrow, centred lines (multi-line equations).
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
		const used = new Set<Line>();
		lines.forEach((l) => {
			if (l.rotated || used.has(l)) return;
			const m = EQ_NUMBER.exec(l.text);
			if (!m || !isEqNumber(m[1]) || seen.has(m[1]) || excluded(p, l.start)) return;
			const numStart = l.start + m.index;
			const numRect = text.rectFor(numStart, numStart + m[0].trimEnd().length);
			if (!numRect) return;
			const bodyText = l.text.slice(0, m.index).trimEnd();
			// Table rows: several parenthesised values on the line.
			if (/\(\d+(?:\.\d+)?\)/.test(bodyText)) return;
			const bodyRect = bodyText ? text.rectFor(l.start, l.start + bodyText.length) : null;
			// Set apart: a wide gap before the number (or the number alone on its line).
			if (bodyRect && numRect[0] - bodyRect[2] < l.size * 1.5) return;
			// Prose ending a sentence right before the number is a reference, not an equation.
			if (/\b[a-z]{3,}[.,;:]?$/.test(bodyText) && !/[=+\-−·×<>≤≥∈)\]}]/.test(bodyText)) return;

			// The text column: median width / centre of body lines around the number.
			// Single-column page (many lines span over half the width), else the number's column.
			const singleColumn =
				lines.filter((x) => x.right - x.x > size.width * 0.5).length > lines.length * 0.3;
			const [colL, colR] = singleColumn ? [0, size.width] : columnOf(numRect, size.width);
			const inColumn = lines.filter(
				(x) =>
					!x.rotated && x.x >= colL - 4 && x.right <= colR + 4 && Math.abs(x.size - l.size) < 1.5
			);
			const widths = inColumn.map((x) => x.right - x.x);
			const textWidth = median(widths.filter((w) => w > median(widths) * 0.8)) || colR - colL;
			const textCentre =
				median(
					inColumn.filter((x) => x.right - x.x > textWidth * 0.9).map((x) => (x.x + x.right) / 2)
				) || (colL + colR) / 2;

			let box: PdfRect = bodyRect ? unionRect([bodyRect, numRect])! : numRect;
			// Vertical gap between the line and the box (0 when they overlap, e.g. same baseline).
			const near = (x: Line, r: PdfRect) =>
				Math.max(0, x.bottom - r[3], r[1] - x.top) < l.size * 1.1;
			// Formula pieces (fraction parts, scripts) sit beside or over the formula, never at the
			// column's left margin like prose.
			const textLeft = textCentre - textWidth / 2;
			const overlapsX = (x: Line, r: PdfRect) =>
				x.x < numRect[0] && x.right > r[0] - l.size * 2 && x.x > textLeft + l.size;
			// Narrow and centred like display math (punctuation can't tell: "… = b.").
			const isDisplay = (x: Line) =>
				x.right - x.x < textWidth * 0.8 &&
				Math.abs((x.x + x.right) / 2 - textCentre) < textWidth * 0.15;
			// Grow to a fixpoint over the lines around it (fragments of one equation are not
			// neighbours in reading order: "softmax(", "QKᵀ", "√dₖ", ")V" share a baseline).
			const body: Line[] = [l];
			const window = lines.filter(
				(x) => x !== l && !x.rotated && !used.has(x) && Math.abs(x.y - l.y) < l.size * 5
			);
			for (let grew = true, n = 0; grew && n < 8; n++) {
				grew = false;
				for (const x of window) {
					if (body.includes(x) || EQ_NUMBER.test(x.text) || CAPTION.test(x.text.trim())) continue;
					// Prose split by inline math: math pieces rarely hold three words.
					if ((x.text.match(/\b[a-z]{3,}\b/g)?.length ?? 0) >= 3) continue;
					const piece = overlapsX(x, box) && near(x, box) && x.right - x.x < textWidth * 0.8;
					if (!piece && !(isDisplay(x) && near(x, box))) continue;
					body.push(x);
					box = unionRect([box, lineRect(x)])!;
					grew = true;
				}
			}
			body.forEach((x) => used.add(x));
			body.sort((a, b) => b.top - a.top);
			seen.add(m[1]);
			out.push({
				id: `equation-${m[1]}`,
				kind: 'equation',
				number: m[1],
				label: `Equation ${m[1]}`,
				caption: cleanQuote(body.map((x) => (x === l ? bodyText : x.text)).join('\n')),
				page: p,
				captionRect: numRect,
				labelRect: numRect,
				rect: box,
				source: 'layout'
			});
		});
	}
	return out;
}

/** The caption's lines: the label line plus following lines of the same block. */
function captionLines(ctx: DocContext, lines: Line[], i: number): Line[] {
	const out = [lines[i]];
	for (let j = i + 1; j < lines.length && out.length < 14; j++) {
		const prev = out[out.length - 1];
		const l = lines[j];
		if (l.rotated || CAPTION.test(l.text.trim())) break;
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

function columnOf(r: PdfRect, pageWidth: number): [number, number] {
	const w = r[2] - r[0];
	if (w > pageWidth * 0.55) return [0, pageWidth];
	return r[0] < pageWidth / 2 ? [0, pageWidth / 2 + 10] : [pageWidth / 2 - 10, pageWidth];
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
export function isProse(text: string): boolean {
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
 * Walk away from the caption (above or below) absorbing graphics (images,
 * vector drawings, rules) and non-prose text lines that touch the growing
 * region, until running text, a heading, another caption or a big gap.
 * Both sides are tried; the expected side wins unless the other has clearly
 * more evidence (tables: rules right next to the caption).
 */
function regionBody(
	ctx: DocContext,
	lines: Line[],
	capLines: Line[],
	captionLineSet: Set<Line>,
	graphics: Graphics,
	col: [number, number],
	kind: FigureKind,
	size: { width: number; height: number }
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
	const halfColumn = colW < size.width * 0.75;
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
		...graphics.rules
			.filter((r) => !inMargin(r) && r[2] - r[0] < colW * 1.15)
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
			!capLines.includes(l) &&
			!inMargin(lineRect(l)) &&
			xOverlap(lineRect(l), col) > 0.5
	);
	const insideAny = (r: PdfRect) => boxes.some(({ r: b, w }) => w === 2 && containedIn(r, b));

	const headingRects = new Set(
		text
			.filter((l) => isHeadingLine(ctx, l) || captionLineSet.has(l))
			.map((l) => lineRect(l).join(','))
	);
	const isHeadingRect = (r: PdfRect) => headingRects.has(r.join(','));
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
				// Smaller text (sub-captions, table cells, plot labels) and "(a) …" sub-captions never end a region.
				const runningText =
					l.size >= ctx.body - 0.6 && !/^\(?[a-z]\)\s/.test(l.text.trim()) && isProse(l.text);
				const stop = !inner && (runningText || isHeadingLine(ctx, l) || captionLineSet.has(l));
				return { r, graphic: false, rule: false, stop, inner };
			})
		].filter(({ r }) => (above ? r[1] >= cap[3] - 3 : r[3] <= cap[1] + 3));
		// Nearest edge first.
		items.sort((a, b) => (above ? a.r[1] - b.r[1] : b.r[3] - a.r[3]));
		let frontier = above ? cap[3] : cap[1];
		const taken: RegionItem[] = [];
		let firstGap = Infinity;
		const nearOf = (it: RegionItem) => (above ? it.r[1] : it.r[3]);
		const farOf = (it: RegionItem) => (above ? it.r[3] : it.r[1]);
		/** Distance from an edge at `from` to an item, walking away from the caption. */
		const gapFrom = (from: number, it: RegionItem) =>
			above ? nearOf(it) - from : from - nearOf(it);
		for (let k = 0; k < items.length; k++) {
			const it = items[k];
			const far = farOf(it);
			const gap = gapFrom(frontier, it);
			const maxGap = maxGapFor(it);
			if (gap > maxGap) {
				// Items fully covered by what we have are fine; otherwise the region ended.
				if (taken.length && (above ? far <= frontier : far >= frontier)) continue;
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
				// Headings and other captions always end the region.
				const isPanelText =
					!!next &&
					(next.graphic || next.rule) &&
					nextGap <= 30 &&
					blockLines <= 8 &&
					blockH <= 100 &&
					items.slice(k, j).every((x) => !isHeadingRect(x.r));
				if (!isPanelText) break;
				for (const x of items.slice(k, j)) taken.push({ ...x, stop: false });
				frontier = end;
				k = j - 1;
				continue;
			}
			if (!taken.length) firstGap = Math.max(0, gap);
			taken.push(it);
			frontier = above ? Math.max(frontier, far) : Math.min(frontier, far);
		}
		if (!taken.length) return null;
		const hasGraphics = taken.some((t) => t.graphic);
		// With graphics, stray text beyond them (a paragraph's short last line) is not part of the figure.
		let kept = taken;
		if (hasGraphics) {
			const g = unionRect(taken.filter((t) => t.graphic || t.rule).map((t) => t.r))!;
			kept = taken.filter(
				(t) => t.graphic || t.rule || (above ? t.r[3] <= g[3] + 14 : t.r[1] >= g[1] - 14)
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
		return { rect, graphics: hasGraphics, score, rules };
	};

	const up = walk(true);
	const down = walk(false);
	// Expected side: figures above the caption; tables below (but many templates put them above).
	const preferred = kind === 'figure' || kind === 'algorithm' ? up : down;
	const other = preferred === up ? down : up;
	let pick = preferred;
	if (!pick || (other && other.score > pick.score * 1.6 + 2)) pick = other ?? pick;
	// Tables: rules on exactly one side decide.
	if (kind === 'table' && up && down) {
		const upRuled = up.rules >= 2;
		const downRuled = down.rules >= 2;
		if (upRuled && !downRuled) pick = up;
		else if (downRuled && !upRuled) pick = down;
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
