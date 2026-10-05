/**
 * "Copy with formatting": rebuild a selection as HTML and Markdown, keeping
 * bold / italic (inferred from the PDF font names, e.g. "CMBX10", "Times-Italic",
 * "NimbusRomNo9L-Medi"), paragraphs, and line-end hyphenation fixed.
 */
import { escapeHtml } from '../extract/layout.js';
import type { PageText } from './text-index.js';
import { cleanQuote } from './text-index.js';

export interface FontStyle {
	bold: boolean;
	italic: boolean;
	mono?: boolean;
}

/** Guess bold / italic / monospace from a PostScript font name. */
export function fontStyleFromName(name: string | undefined | null): FontStyle {
	const n = (name ?? '').replace(/^[A-Z]{6}\+/, '');
	return {
		bold: /bold|black|heavy|semibold|demi|medi(?!um)|cmbx|cmb\d|\bbx\b|-b\b|,bold/i.test(n),
		italic: /italic|oblique|cmti|cmmi|cmsl|\bti\b|-i\b|ital|slant/i.test(n),
		mono: /mono|courier|cmtt|consol|menlo|code/i.test(n)
	};
}

export interface RichText {
	plain: string;
	markdown: string;
	html: string;
}

/**
 * Formatting-preserving text of a raw range. `styleOf(fontName)` maps pdf.js
 * font ids to styles (see PdfDocument.fontStyle); without it, text is plain.
 */
export function richTextOf(
	text: PageText,
	start: number,
	end: number,
	styleOf?: (fontName: string) => FontStyle | undefined
): RichText {
	type Run = { s: string; style: FontStyle };
	const runs: Run[] = [];
	for (let i = text.itemAt(start); i < text.items.length; i++) {
		const itemStart = text.itemStart[i];
		if (itemStart >= end) break;
		const next = text.itemStart[i + 1] ?? text.raw.length;
		const s = text.raw.slice(Math.max(start, itemStart), Math.min(end, next));
		if (!s) continue;
		const font = text.items[i].fontName;
		const style = (font && styleOf?.(font)) || { bold: false, italic: false };
		const last = runs.at(-1);
		if (
			last &&
			last.style.bold === style.bold &&
			last.style.italic === style.italic &&
			!!last.style.mono === !!style.mono
		)
			last.s += s;
		else runs.push({ s, style });
	}
	// Whitespace (line breaks included) collapses to single spaces: the copy is one paragraph.
	const fix = (s: string) => cleanQuote(s, { trim: false });
	const plain = cleanQuote(runs.map((r) => r.s).join(''));
	const wrap = (s: string, style: FontStyle, md: boolean) => {
		const core = s.trim();
		if (!core) return s;
		const lead = s.slice(0, s.indexOf(core));
		const tail = s.slice(s.indexOf(core) + core.length);
		let out = md ? core : escapeHtml(core);
		if (style.mono) out = md ? `\`${out}\`` : `<code>${out}</code>`;
		if (style.italic) out = md ? `*${out}*` : `<em>${out}</em>`;
		if (style.bold) out = md ? `**${out}**` : `<strong>${out}</strong>`;
		return lead + out + tail;
	};
	const markdown = runs
		.map((r) => wrap(fix(r.s), r.style, true))
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
	const html = `<p>${runs
		.map((r) => wrap(fix(r.s), r.style, false))
		.join('')
		.replace(/\s+/g, ' ')
		.trim()}</p>`;
	return { plain, markdown, html };
}
