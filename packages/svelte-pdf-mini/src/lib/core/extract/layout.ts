/**
 * Built-in extractor: rebuilds rows and columns from the text index (text
 * item positions), which works well for typical academic tables (few rules,
 * aligned columns), and falls back to paragraphs for prose.
 */
import type { PageText, TextItemLike } from '../text/text-index.js';
import { cleanQuote } from '../text/text-index.js';
import { distanceToRange } from '../view/geometry.js';
import type { RegionExtraction, RegionExtractor, RegionRequest } from './types.js';

interface Cell {
	x0: number;
	x1: number;
	y: number;
	h: number;
	text: string;
}

export function layoutExtractor(getPageText: (page: number) => Promise<PageText>): RegionExtractor {
	return {
		id: 'layout',
		async extract(req: RegionRequest) {
			const text = await getPageText(req.page);
			return extractFromPageText(text, req);
		}
	};
}

/** Synchronous core of the layout extractor (also handy in tests). */
export function extractFromPageText(text: PageText, req: RegionRequest): RegionExtraction | null {
	const [rx1, ry1, rx2, ry2] = req.rect;
	const items: Cell[] = [];
	text.items.forEach((it: TextItemLike) => {
		if (!it.str.trim()) return;
		const [, , c, d, x, y] = it.transform;
		const h = Math.hypot(c, d) || it.height || 1;
		const x1 = x + it.width;
		if (x1 < rx1 || x > rx2 || y < ry1 || y + h * 0.7 > ry2 + 2) return;
		items.push({ x0: x, x1, y, h, text: it.str });
	});
	if (!items.length) return null;

	// Rows: group by baseline. Small items (super/subscripts) join the nearest row.
	const heights = items.map((i) => i.h).sort((a, b) => a - b);
	const bodyH = heights[Math.floor(heights.length / 2)] || 10;
	const main = items.filter((i) => i.h >= bodyH * 0.8).sort((a, b) => b.y - a.y || a.x0 - b.x0);
	const small = items.filter((i) => i.h < bodyH * 0.8);
	const rows: Cell[][] = [];
	for (const it of main) {
		const row = rows.at(-1);
		if (row && Math.abs(row[0].y - it.y) < Math.min(row[0].h, it.h) * 0.45) row.push(it);
		else rows.push([it]);
	}
	for (const it of small) {
		let best: Cell[] | null = null;
		let bestD = Infinity;
		for (const row of rows) {
			const d = Math.abs(row[0].y - it.y);
			if (d < bestD) {
				bestD = d;
				best = row;
			}
		}
		if (best && bestD < best[0].h * 0.9) best.push(it);
		else rows.push([it]);
	}
	rows.sort((a, b) => b[0].y - a[0].y);
	// Join pieces of a row into words (word spacing only, so columns stay apart).
	const merged = rows.map((row) => {
		row.sort((a, b) => a.x0 - b.x0);
		const out: Cell[] = [];
		for (const it of row) {
			const prev = out.at(-1);
			const gap = prev ? it.x0 - prev.x1 : Infinity;
			const sup = it.h < bodyH * 0.8;
			if (prev && (gap < bodyH * 0.12 || (sup && gap < bodyH * 0.4))) {
				// Small raised / lowered runs are super- / subscripts: "^2", "_i".
				const scriptMark = it.y > prev.y ? '^' : '_';
				prev.text += sup ? `${scriptMark}${it.text}` : it.text;
				prev.x1 = it.x1;
			} else out.push({ ...it });
		}
		return out;
	});

	const isTable =
		req.kind === 'table' ||
		(req.kind !== 'text' &&
			merged.filter((r) => r.length >= 2).length >= Math.max(2, merged.length * 0.5));
	if (!isTable) {
		const para = cleanQuote(merged.map((r) => r.map((c) => c.text).join(' ')).join('\n'));
		return { markdown: para, html: `<p>${escapeHtml(para)}</p>`, source: 'layout' };
	}

	// Caption / prose rows (one cell spanning most of the region) are not table rows.
	const width = rx2 - rx1;
	const extent = (row: Cell[]) => row.at(-1)!.x1 - row[0].x0;
	const maxGap = (row: Cell[]) =>
		row.reduce((g, c, k) => (k ? Math.max(g, c.x0 - row[k - 1].x1) : g), 0);
	// Prose (caption) rows: wide, wordy, and only word-sized gaps; table rows have column gaps.
	const isProse = (row: Cell[]) =>
		extent(row) > width * 0.45 &&
		maxGap(row) < bodyH * 1.1 &&
		row
			.map((c) => c.text)
			.join(' ')
			.split(/\s+/).length >= 5;
	const firstTable = merged.findIndex((r) => !isProse(r));
	let lastTable = merged.length - 1;
	while (lastTable > firstTable && isProse(merged[lastTable])) lastTable--;
	const before = merged.slice(0, Math.max(0, firstTable));
	const after = merged.slice(lastTable + 1);
	const body = firstTable < 0 ? [] : merged.slice(firstTable, lastTable + 1);
	const proseOf = (rows: Cell[][]) =>
		cleanQuote(rows.map((r) => r.map((c) => c.text).join(' ')).join('\n'));
	const caption = [proseOf(before), proseOf(after)].filter(Boolean).join('\n\n');
	if (!body.length)
		return { markdown: caption, html: `<p>${escapeHtml(caption)}</p>`, source: 'layout' };

	// Columns: union of cell x-ranges over the rows with the most cells (spanning
	// cells in sparse rows would merge columns); other rows are assigned by overlap.
	const counts = body.map((r) => r.length).sort((a, b) => a - b);
	const ref = counts[Math.floor(counts.length * 0.7)] ?? 1;
	const refRows = body.filter((r) => r.length >= Math.max(2, ref * 0.8));
	const spans = (refRows.length ? refRows : body)
		.flat()
		.map((c) => [c.x0, c.x1] as [number, number])
		.sort((a, b) => a[0] - b[0]);
	const cols: [number, number][] = [];
	for (const [a, b] of spans) {
		const last = cols.at(-1);
		if (last && a <= last[1] + bodyH * 0.35) last[1] = Math.max(last[1], b);
		else cols.push([a, b]);
	}
	const colOf = (c: Cell) => {
		const mid = (c.x0 + c.x1) / 2;
		let best = 0;
		let bestD = Infinity;
		cols.forEach(([a, b], i) => {
			const d = distanceToRange(mid, a, b);
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		});
		return best;
	};
	const cells = body.map((row) => {
		const out = Array.from({ length: cols.length }, () => '');
		for (const c of row) {
			const i = colOf(c);
			out[i] = out[i] ? `${out[i]} ${c.text}` : c.text;
		}
		return out.map((s) => s.trim());
	});
	// Drop empty columns.
	const keep = cols.map((_, i) => cells.some((r) => r[i]));
	let table = cells.map((r) => r.filter((_, i) => keep[i]));
	// Multi-line header: rows before the first well-filled row are stacked into one header row.
	const filled = (r: string[]) => r.filter(Boolean).length / Math.max(1, r.length);
	const firstFull = table.findIndex((r) => filled(r) >= 0.6);
	if (firstFull > 0) {
		const header = table[0].map((_, i) =>
			table
				.slice(0, firstFull + 1)
				.map((r) => r[i])
				.filter(Boolean)
				.join(' ')
		);
		table = [header, ...table.slice(firstFull + 1)];
	}
	// Header continuation lines ("Sequential / Operations"): sparse, all-text rows right under the header.
	while (table.length > 2 && filled(table[1]) < 0.5 && table[1].every((c) => !c || !/\d/.test(c))) {
		const cont = table[1];
		table = [table[0].map((h, i) => [h, cont[i]].filter(Boolean).join(' ')), ...table.slice(2)];
	}
	const md = toMarkdownTable(table);
	return {
		markdown: caption ? `${md}\n\n${caption}` : md,
		html: toHtmlTable(table) + (caption ? `<p>${escapeHtml(caption)}</p>` : ''),
		cells: table,
		source: 'layout'
	};
}

export function toMarkdownTable(rows: string[][]): string {
	if (!rows.length) return '';
	const esc = (s: string) => s.replace(/\|/g, '\\|');
	const [head, ...body] = rows;
	const line = (r: string[]) => `| ${r.map(esc).join(' | ')} |`;
	return [line(head), `| ${head.map(() => '---').join(' | ')} |`, ...body.map(line)].join('\n');
}

export function toHtmlTable(rows: string[][]): string {
	const [head, ...body] = rows;
	const tr = (r: string[], tag: string) =>
		`<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
	return `<table><thead>${tr(head ?? [], 'th')}</thead><tbody>${body.map((r) => tr(r, 'td')).join('')}</tbody></table>`;
}

export function escapeHtml(s: string): string {
	return s.replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
	);
}
