import type { SearchOptions } from '../../core/text/search.js';

export type FindOption = keyof SearchOptions;

/** Every search option, in toolbar order. */
export const FIND_OPTIONS = [
	'caseSensitive',
	'wholeWord',
	'regex',
	'diacritics'
] as const satisfies readonly FindOption[];

/** Default glyph of each option's toggle button. */
export const FIND_OPTION_GLYPHS: Record<FindOption, string> = {
	caseSensitive: 'Aa',
	wholeWord: 'W',
	regex: '.*',
	diacritics: 'é'
};
