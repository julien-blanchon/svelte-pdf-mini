/**
 * Test helper: one annotation of every kind on attention.pdf, anchored to real
 * text (quads come from the text index, like the UI would produce).
 */
import { readFileSync } from 'node:fs';
import type { Annotation } from '../annotations/model.js';
import { PageText } from '../text/text-index.js';
import { fixturePath, openFixture } from '../../test/fixtures.js';

const T0 = '2026-10-04T10:00:00.000Z';

export async function loadAttention() {
	const bytes = new Uint8Array(readFileSync(fixturePath('attention.pdf')));
	const doc = await openFixture('attention.pdf');
	const text1 = new PageText(1, await (await doc.getPage(1)).getTextContent());
	const text2 = new PageText(2, await (await doc.getPage(2)).getTextContent());
	return { bytes, text1, text2 };
}

function markup(
	text: PageText,
	phrase: string,
	kind: 'highlight' | 'underline' | 'strikeout' | 'squiggly',
	id: string,
	extra: Partial<Annotation> = {}
): Annotation {
	const i = text.raw.indexOf(phrase);
	if (i < 0) throw new Error(`phrase not found: ${phrase}`);
	const quads = text.quadsFor(i, i + phrase.length);
	const rect = text.rectFor(i, i + phrase.length)!;
	return {
		id,
		page: text.page,
		kind,
		rect,
		quads,
		quote: { exact: text.textOf(i, i + phrase.length), start: i, end: i + phrase.length },
		color: [1, 0.835, 0.29],
		opacity: kind === 'highlight' ? 0.5 : 1,
		paletteKey: 'yellow',
		createdAt: T0,
		modifiedAt: T0,
		origin: 'local',
		...extra
	} as Annotation;
}

export function sampleAnnotations(text1: PageText, _text2: PageText): Annotation[] {
	const base = { createdAt: T0, modifiedAt: T0, origin: 'local' as const, opacity: 1 };
	return [
		markup(text1, 'Attention Is All You Need', 'highlight', 'hl-title', {
			contents: 'The title — with **Markdown** and ünïcödé.',
			contentsFormat: 'markdown',
			author: { name: 'Julien', id: 'u1' },
			tags: ['title'],
			extra: { reviewer: true, score: 3 }
		}),
		markup(text1, 'The dominant sequence transduction models', 'underline', 'ul-1', {
			color: [0.31, 0.6, 0.93],
			paletteKey: 'blue'
		}),
		markup(text1, 'complex recurrent or', 'strikeout', 'so-1', {
			color: [0.94, 0.42, 0.42],
			paletteKey: 'red'
		}),
		markup(text1, 'attention mechanism', 'squiggly', 'sq-1', {
			color: [0.49, 0.88, 0.69],
			paletteKey: 'green'
		}),
		{
			...base,
			id: 'reply-1',
			page: 1,
			kind: 'note',
			rect: [60, 700, 80, 720],
			color: [1, 0.85, 0.3],
			contents: 'I agree!',
			inReplyTo: 'hl-title',
			author: { name: 'Ana' }
		},
		{
			...base,
			id: 'note-1',
			page: 1,
			kind: 'note',
			rect: [520, 600, 540, 620],
			color: [1, 0.85, 0.3],
			contents: 'Margin note\nsecond line',
			icon: 'Comment'
		},
		{
			...base,
			id: 'area-1',
			page: 2,
			kind: 'area',
			rect: [100, 300, 500, 500],
			color: [0.5, 0.64, 0.42],
			fill: [0.87, 0.91, 0.83],
			fillOpacity: 0.2,
			width: 1.5,
			label: 'Fig. 1',
			contents: 'The architecture figure'
		},
		{
			...base,
			id: 'rect-1',
			page: 2,
			kind: 'rect',
			rect: [50, 50, 150, 120],
			color: [0.2, 0.2, 0.8],
			width: 2,
			dash: [4, 2]
		},
		{
			...base,
			id: 'ell-1',
			page: 2,
			kind: 'ellipse',
			rect: [200, 50, 300, 120],
			color: [0.8, 0.2, 0.2],
			width: 1,
			fill: [1, 0.9, 0.9],
			fillOpacity: 0.5
		},
		{
			...base,
			id: 'line-1',
			page: 2,
			kind: 'line',
			rect: [320, 50, 420, 100],
			color: [0, 0, 0],
			width: 1,
			points: [
				[320, 50],
				[420, 100]
			]
		},
		{
			...base,
			id: 'arrow-1',
			page: 2,
			kind: 'arrow',
			rect: [320, 110, 420, 160],
			color: [0.9, 0.3, 0.1],
			width: 2,
			points: [
				[320, 110],
				[420, 160]
			],
			lineEndings: ['none', 'closed-arrow']
		},
		{
			...base,
			id: 'poly-1',
			page: 2,
			kind: 'polygon',
			rect: [440, 50, 540, 150],
			color: [0.3, 0.6, 0.3],
			width: 1,
			points: [
				[440, 50],
				[540, 50],
				[490, 150]
			]
		},
		{
			...base,
			id: 'pline-1',
			page: 2,
			kind: 'polyline',
			rect: [440, 160, 540, 220],
			color: [0.3, 0.3, 0.6],
			width: 1,
			points: [
				[440, 160],
				[490, 220],
				[540, 160]
			]
		},
		{
			...base,
			id: 'ink-1',
			page: 2,
			kind: 'ink',
			rect: [50, 600, 200, 700],
			color: [0.1, 0.1, 0.9],
			width: 2,
			paths: [
				{
					points: [
						[50, 600],
						[80, 650],
						[120, 640],
						[160, 690],
						[200, 700]
					],
					pressure: [0.2, 0.5, 0.8, 0.6, 0.3]
				}
			]
		},
		{
			...base,
			id: 'ft-1',
			page: 2,
			kind: 'freetext',
			rect: [300, 600, 520, 680],
			color: [0.4, 0.4, 0.4],
			text: 'Free text box\nwith two lines – and a long sentence that wraps',
			font: { family: 'Helvetica', size: 11 },
			textColor: [0.1, 0.1, 0.1],
			fill: [1, 1, 0.9]
		},
		{
			...base,
			id: 'stamp-1',
			page: 2,
			kind: 'stamp',
			rect: [300, 700, 420, 740],
			color: [0.8, 0.1, 0.1],
			name: 'Approved'
		}
	] as Annotation[];
}

/** A tiny red PNG (1×1) as data URL, for image stamps. */
export const RED_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
