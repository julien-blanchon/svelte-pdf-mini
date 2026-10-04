import type { HTMLAttributes } from 'svelte/elements';
import type { KeymapAction } from '../../core/i18n/keymap.js';
import type { WithChild } from '../../internal/component-types.js';

interface ShortcutOwnProps {
	/** Keymap action to show (e.g. 'markup.highlight'). Reflects user overrides. */
	action: KeymapAction | (string & {});
	/** Which of the action's combos (default the first). */
	index?: number;
}

export type ShortcutProps = WithChild<ShortcutOwnProps, { label: string; keys: string[] }> &
	Omit<HTMLAttributes<HTMLElement>, keyof ShortcutOwnProps | 'children'>;
