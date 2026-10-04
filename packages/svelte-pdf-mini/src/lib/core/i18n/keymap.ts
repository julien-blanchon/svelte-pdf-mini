/**
 * Keyboard shortcuts for annotation work, as one overridable map.
 * Combos: "mod+z" (Ctrl on Windows/Linux, ⌘ on macOS), "shift+mod+z", "alt+1",
 * plain keys ("h", "Delete", "Escape", "ArrowLeft"). Several combos per action.
 */
export const defaultKeymap = {
	// ── View & navigation (Viewer) ──
	'view.zoomIn': ['mod+=', 'mod++'],
	'view.zoomOut': ['mod+-'],
	'view.fitWidth': ['mod+0'],
	'view.rotateCw': ['mod+]'],
	'view.rotateCcw': ['mod+['],
	'nav.back': ['alt+ArrowLeft'],
	'nav.forward': ['alt+ArrowRight'],
	/** Arrows turn pages when nothing scrolls sideways; PageDown / Space in paged mode. */
	'nav.nextPage': ['ArrowRight', 'PageDown', ' '],
	'nav.prevPage': ['ArrowLeft', 'PageUp'],
	'nav.firstPage': ['Home'],
	'nav.lastPage': ['End'],
	'find.open': ['mod+f'],
	'edit.copy': ['mod+c'],
	'edit.copyFormatted': ['shift+mod+c'],
	'help.shortcuts': ['?'],
	'menu.context': ['shift+F10', 'ContextMenu'],
	// ── Annotations ──
	'tool.select': ['v'],
	'tool.highlight': ['h'],
	'tool.underline': ['u'],
	'tool.strikeout': ['s'],
	'tool.squiggly': ['q'],
	'tool.area': ['a'],
	'tool.note': ['n'],
	'tool.ink': ['p'],
	'tool.rect': ['r'],
	'tool.ellipse': ['o'],
	'tool.arrow': ['l'],
	'tool.freetext': ['t'],
	'tool.eraser': ['e'],
	/** With text selected: create a markup of the current colour. */
	'markup.highlight': ['h'],
	'markup.underline': ['u'],
	'markup.strikeout': ['s'],
	'markup.comment': ['c'],
	/** Colour N of the palette (applies to the selection / pending annotation, or the next one). */
	'color.1': ['1', 'alt+1'],
	'color.2': ['2', 'alt+2'],
	'color.3': ['3', 'alt+3'],
	'color.4': ['4', 'alt+4'],
	'color.5': ['5', 'alt+5'],
	'color.6': ['6', 'alt+6'],
	'color.7': ['7', 'alt+7'],
	'color.8': ['8', 'alt+8'],
	'color.9': ['9', 'alt+9'],
	/** Keep a just-created annotation. */
	confirm: ['Enter'],
	/** Discard a just-created annotation, otherwise deselect / back to select tool. */
	cancel: ['Escape'],
	delete: ['Delete', 'Backspace'],
	/** Open the selected annotation's note for typing. */
	edit: ['Enter', 'F2'],
	undo: ['mod+z'],
	redo: ['shift+mod+z', 'mod+y'],
	'nudge.left': ['ArrowLeft'],
	'nudge.right': ['ArrowRight'],
	'nudge.up': ['ArrowUp'],
	'nudge.down': ['ArrowDown']
};

export type KeymapAction = keyof typeof defaultKeymap;
export type Keymap = Record<KeymapAction, string[]>;

const isMac = (): boolean =>
	typeof navigator !== 'undefined' &&
	/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Split a combo into its parts, key last. "mod++" means the "+" key. */
function comboParts(combo: string): string[] {
	if (combo.endsWith('++')) return [...combo.slice(0, -2).split('+').filter(Boolean), '+'];
	return combo.split('+').filter(Boolean);
}

/** Does the event match a combo like "shift+mod+z"? (Shift is ignored for digits and symbols unless listed.) */
export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
	const parts = comboParts(combo);
	const key = parts.pop()!;
	const want = new Set(parts.map((p) => p.toLowerCase()));
	const mac = isMac();
	const mod = mac ? e.metaKey : e.ctrlKey;
	const otherMod = mac ? e.ctrlKey : e.metaKey;
	if (want.has('mod') !== mod) return false;
	if (want.has('alt') !== e.altKey) return false;
	if (!want.has('mod') && otherMod) return false;
	const isLetter = key.length === 1 && /[a-z]/i.test(key);
	if (want.has('shift') !== e.shiftKey && isLetter) return false;
	// With Alt held, macOS reports a symbol in e.key; fall back to e.code for letters/digits.
	const pressed =
		e.altKey && /^(Key|Digit)/.test(e.code) ? e.code.replace(/^(Key|Digit)/, '') : e.key;
	return pressed.toLowerCase() === key.toLowerCase();
}

/** First action (in `actions` order) whose combos match the event. */
export function matchAction<A extends string>(
	e: KeyboardEvent,
	keymap: Record<A, string[]>,
	actions: A[]
): A | null {
	for (const a of actions) if (keymap[a]?.some((c) => matchesCombo(e, c))) return a;
	return null;
}

type Modifier = 'mod' | 'shift' | 'alt';

const MODIFIER_LABELS: Record<'mac' | 'other', Record<Modifier, string>> = {
	mac: { mod: '⌘', shift: '⇧', alt: '⌥' },
	other: { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' }
};

const KEY_LABELS: Partial<Record<string, string>> = {
	' ': 'Space',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓'
};

const isModifier = (part: string): part is Modifier =>
	part === 'mod' || part === 'shift' || part === 'alt';

/** Label of one combo part: platform modifier glyph/name, key symbol, or upper-cased letter. */
function partLabel(part: string, mac: boolean): string {
	if (isModifier(part)) return MODIFIER_LABELS[mac ? 'mac' : 'other'][part];
	const known = KEY_LABELS[part];
	if (known) return known;
	return part.length === 1 ? part.toUpperCase() : part;
}

/** Human label for the first combo of an action ("⌘Z", "Ctrl+Z", "H"). */
export function comboLabel(keymap: Partial<Keymap>, action: KeymapAction): string {
	const combo = keymap[action]?.[0] ?? defaultKeymap[action][0];
	const mac = isMac();
	return comboParts(combo)
		.map((p) => partLabel(p, mac))
		.join(mac ? '' : '+');
}
