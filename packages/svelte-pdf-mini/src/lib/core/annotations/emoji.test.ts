import { describe, expect, it } from 'vitest';
import { defaultNoteEmojis, isSingleEmoji, noteIconFor } from './emoji.js';

describe('note emoji', () => {
	it('maps emoji to the closest standard note icon', () => {
		expect(defaultNoteEmojis.map(noteIconFor)).toEqual([
			'Comment',
			'Help',
			'Key',
			'Comment',
			'Comment',
			'Comment',
			'Comment',
			'Note'
		]);
	});

	it('accepts exactly one emoji grapheme', () => {
		for (const e of ['😀', '😵‍💫', '⚠️', '🇫🇷', '1️⃣', '👍🏽', '🧑‍🔬']) expect(isSingleEmoji(e)).toBe(true);
		for (const e of ['', 'a', '😀😀', '😀 ', 'ab', '1']) expect(isSingleEmoji(e)).toBe(false);
	});
});
