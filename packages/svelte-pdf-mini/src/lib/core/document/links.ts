import type { LinkKind } from '../paper/types.js';

/** Classify hyperref-style named destinations ("cite.vaswani", "figure.3", "section.2.1"…). */
export function classifyDest(dest: unknown): LinkKind {
	if (typeof dest !== 'string') return 'other';
	const d = dest.toLowerCase();
	if (/^cite[.:]/.test(d)) return 'citation';
	if (/^(sub)*section[.*]|^chapter[.*]|^appendix[.*]|^part[.*]/.test(d)) return 'section';
	if (/^figure[.*]|^subfigure/.test(d)) return 'figure';
	if (/^table[.*]|^subtable/.test(d)) return 'table';
	if (/^equation[.*]|^eq[.:]|^amsmath/.test(d)) return 'equation';
	if (/^hfootnote|^footnote/.test(d)) return 'footnote';
	if (/^algorithm|^alg[.:]|^algocf/.test(d)) return 'algorithm';
	if (/^page[.*]/.test(d)) return 'page';
	return 'other';
}

/** PDF-space height of a preview strip for a link kind (from the target point downwards). */
export function previewHeight(kind: LinkKind): number {
	switch (kind) {
		case 'citation':
			return 64;
		case 'equation':
			return 70;
		case 'footnote':
			return 40;
		case 'figure':
		case 'table':
		case 'algorithm':
			return 300;
		default:
			return 180;
	}
}
