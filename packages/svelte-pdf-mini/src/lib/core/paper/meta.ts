/** Title, authors, abstract and identifiers from the first page(s). */
import { cleanQuote } from '../text/text-index.js';
import type { DocContext } from './context.js';
import type { Line } from './lines.js';
import type { PaperMeta } from './types.js';

/** Affiliation / contact words, at word starts so names like "Brainard" or "Metallinou" survive. */
export const AFFILIATION =
	/\b(?:univ|institut|research|labs?\b|laborator|depart|school|college|cent(?:er|re)\b|google|microsoft|openai|deepmind|meta\b|facebook|amazon|apple\b|nvidia|inc\b|corp\b|ltd\b|gmbh|brain\b|group|academy|hospital|foundation)|@|https?:|\d{3,}/i;

export function extractMeta(ctx: DocContext): PaperMeta {
	const meta: PaperMeta = { authors: [] };
	const first = ctx.lines[0] ?? [];
	const firstRaw = ctx.texts[0]?.raw ?? '';

	// Title: the run of largest-font, unrotated lines on page 1.
	const candidates = first.filter((l) => !l.rotated && l.text.trim().length > 3);
	let titleEnd = -1;
	if (candidates.length) {
		const max = Math.max(...candidates.map((l) => l.size));
		if (max > ctx.body * 1.15) {
			const idx = first.findIndex(
				(l) => !l.rotated && Math.abs(l.size - max) < 0.6 && l.text.trim().length > 3
			);
			const parts: string[] = [];
			let i = idx;
			while (i < first.length && Math.abs(first[i].size - max) < 0.6 && !first[i].rotated) {
				parts.push(first[i].text.trim());
				i++;
			}
			meta.title = cleanQuote(parts.join('\n'));
			titleEnd = i;
		}
	}

	// Abstract: the line "Abstract" (or "Abstract—…" / "Abstract." inline) on page 1–2.
	for (let p = 0; p < Math.min(2, ctx.lines.length) && !meta.abstract; p++) {
		const lines = ctx.lines[p];
		const i = lines.findIndex((l) => /^\s*abstract\b/i.test(l.text) && l.text.trim().length < 400);
		if (i === -1) continue;
		const head = lines[i];
		const inline = head.text.replace(/^\s*abstract\s*[.:—–-]?\s*/i, '');
		const parts = inline.trim() ? [inline] : [];
		for (let j = i + 1; j < lines.length; j++) {
			const l = lines[j];
			if (l.rotated) continue;
			// Stop at the next heading (bigger font or numbered/known heading) or a big gap.
			if (
				/^(?:1\.?|I\.)?\s*introduction\b/i.test(l.text.trim()) ||
				/^(keywords|index terms)\b/i.test(l.text.trim())
			)
				break;
			if (l.size > ctx.body * 1.1 && l.text.trim().length < 80) break;
			parts.push(l.text);
			if (parts.join(' ').length > 4000) break;
		}
		meta.abstract = cleanQuote(parts.join('\n')) || undefined;
		// Authors: lines between the title and the abstract.
		if (p === 0 && titleEnd !== -1) meta.authors = extractAuthors(ctx, first.slice(titleEnd, i));
	}
	// No "Abstract" heading: the first paragraph of long lines before the introduction.
	if (!meta.abstract && titleEnd !== -1) {
		const parts: string[] = [];
		for (let j = titleEnd; j < first.length; j++) {
			const l = first[j];
			if (l.rotated) continue;
			const words = l.text.trim().split(/\s+/).length;
			if (/^(?:1\.?|I\.)?\s*introduction\b/i.test(l.text.trim())) break;
			// Prose: long line, mostly lowercase words (skips author and affiliation lines).
			const lower = l.text
				.trim()
				.split(/\s+/)
				.filter((w) => /^\p{Ll}/u.test(w)).length;
			if (!parts.length && (words < 10 || lower < words * 0.5 || /[∗†‡]|\d,\d/.test(l.text)))
				continue;
			if (parts.length && (words < 3 || l.size > ctx.body * 1.1)) {
				if (words < 3 && parts.length > 2) break;
			}
			parts.push(l.text);
			if (parts.join(' ').length > 2500) break;
		}
		if (parts.length >= 2) meta.abstract = cleanQuote(parts.join('\n'));
	}
	if (!meta.authors.length && titleEnd !== -1) {
		meta.authors = extractAuthors(ctx, first.slice(titleEnd, titleEnd + 8));
	}

	const arxiv = /arXiv:\s*((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7})|\d{4}\.\d{4,5})(v\d+)?/i.exec(
		firstRaw
	);
	if (arxiv) meta.arxivId = arxiv[1];
	const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(firstRaw);
	if (doi) meta.doi = doi[1].replace(/[.,;)\]]+$/, '');
	return meta;
}

function extractAuthors(ctx: DocContext, lines: Line[]): string[] {
	const usable = lines.filter((l) => l.text.trim() && !AFFILIATION.test(l.text));
	if (!usable.length) return [];
	const text = ctx.texts[0];
	// Author names usually share the font of the first line after the title.
	const font = usable[0].font;
	const names: string[] = [];
	for (const l of usable) {
		if (l.font !== font) continue;
		// Split on item boundaries too: names are often separate text items on one line.
		const pieces: string[] = [];
		for (let i = text.itemAt(l.start); i <= text.itemAt(Math.max(l.start, l.end - 1)); i++)
			pieces.push(text.items[i].str);
		for (const piece of pieces)
			for (let part of piece.split(/\s*(?:,|;|\band\b|&|\s{2,}|[∗*†‡§¶♯♮]+)\s*/)) {
				part = part.replace(/[∗*†‡§¶0-9]+/g, '').trim();
				if (
					/^\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*){1,4}$/u.test(part) &&
					!AFFILIATION.test(part)
				)
					names.push(part);
			}
	}
	return [...new Set(names)].slice(0, 60);
}
