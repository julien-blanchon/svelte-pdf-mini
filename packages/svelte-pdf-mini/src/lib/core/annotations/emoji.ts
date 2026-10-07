/** Emoji for note markers: the default set (keys 1–8) and their standard PDF icons. */

/** Default note emoji, picked with keys 1–8 while the note tool is active. */
export const defaultNoteEmojis: readonly string[] = [
	'💬',
	'🤔',
	'💡',
	'🤯',
	'🧐',
	'🤨',
	'😍',
	'📌'
];

/** Standard /Name icons (PDF 32000 §12.5.6.4) that some emoji map to naturally. */
const NOTE_ICONS: Record<string, string> = {
	'💬': 'Comment',
	'🗨️': 'Comment',
	'🤔': 'Help',
	'❓': 'Help',
	'❔': 'Help',
	'💡': 'Key',
	'🔑': 'Key',
	'📌': 'Note',
	'📝': 'Note',
	'🗒️': 'Note'
};

/**
 * The /Name a note with this emoji is written with, so viewers that only know
 * the standard icons (Preview, Acrobat) still show something meaningful.
 */
export function noteIconFor(emoji: string): string {
	return NOTE_ICONS[emoji] ?? 'Comment';
}

/** Whether a string is exactly one emoji grapheme (flags and keycaps included). */
export function isSingleEmoji(value: string): boolean {
	const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
	return (
		graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)
	);
}
