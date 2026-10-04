import { describe, expect, it } from 'vitest';
import { openFixture } from '../../test/fixtures.js';
import { PageText, quadsBounds } from '../text/text-index.js';
import { isAnchored, reanchor, reanchorAll } from './anchor.js';
import type { TextMarkupAnnotation } from './model.js';

describe('re-anchoring', async () => {
	const doc = await openFixture('attention.pdf');
	const text2 = new PageText(2, await (await doc.getPage(2)).getTextContent());
	const text3 = new PageText(3, await (await doc.getPage(3)).getTextContent());
	const i = text2.norm.indexOf('sequential nature precludes parallelization');
	const [s, e] = text2.normRangeToRaw(i, i + 'sequential nature precludes parallelization'.length);
	const quads = text2.quadsFor(s, e);
	const base: TextMarkupAnnotation = {
		id: 'h1',
		page: 2,
		kind: 'highlight',
		quads,
		rect: quadsBounds(quads)!,
		color: [1, 1, 0],
		opacity: 1,
		createdAt: '',
		modifiedAt: '',
		quote: {
			exact: text2.textOf(s, e),
			prefix: text2.textOf(s - 30, s),
			suffix: text2.textOf(e, e + 30),
			start: s,
			end: e
		}
	};

	it('keeps anchored markups', () => {
		expect(isAnchored(base, text2)).toBe(true);
		expect(reanchor(base, text2).status).toBe('ok');
	});

	it('moves markups whose quads drifted', () => {
		const drifted = {
			...base,
			quads: base.quads.map((q) => q.map((v, k) => (k % 2 ? v - 120 : v)) as typeof q)
		};
		expect(isAnchored(drifted, text2)).toBe(false);
		const r = reanchor(drifted, text2);
		expect(r.status).toBe('moved');
		expect(r.annotation.quads[0][1]).toBeCloseTo(base.quads[0][1], 1);
	});

	it('finds a markup on a neighbouring page, or flags it as orphan', async () => {
		const wrongPage = { ...base, page: 3, quads: [] };
		const res = await reanchorAll([wrongPage], async (p) => ({ 2: text2, 3: text3 })[p] ?? null, {
			numPages: 15
		});
		expect(res.moved).toBe(1);
		expect(res.annotations[0].page).toBe(2);
		const lost = { ...base, quote: { exact: 'this sentence does not exist anywhere' } };
		const res2 = await reanchorAll([lost], async (p) => (p === 2 ? text2 : null), { numPages: 15 });
		expect(res2.orphans).toBe(1);
	});
});
