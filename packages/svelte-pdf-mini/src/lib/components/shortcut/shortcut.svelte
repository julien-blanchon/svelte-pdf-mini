<script lang="ts" module>
	import type { Keymap, KeymapAction } from '../../core/i18n/keymap.js';

	const isKeymapAction = (keymap: Keymap, action: string): action is KeymapAction =>
		Object.hasOwn(keymap, action);

	const MODIFIER_GLYPHS = /[⌘⇧⌥⌃]|[^⌘⇧⌥⌃]+/g;

	/** Individual keys for <kbd> rendering ("⇧⌘C" → ["⇧", "⌘", "C"], "Ctrl+Z" → ["Ctrl", "Z"]). */
	function splitComboLabel(label: string): string[] {
		if (label.length > 1 && label.includes('+')) return label.split('+');
		return [...label.matchAll(MODIFIER_GLYPHS)].map((m) => m[0]);
	}
</script>

<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { comboLabel } from '../../core/i18n/keymap.js';
	import { AnnotationsContext, ViewerContext } from '../../state/context.js';
	import type { ShortcutProps } from './types.js';

	let {
		action,
		index = 0,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ShortcutProps = $props();
	const viewer = ViewerContext.get();
	const store = AnnotationsContext.getOr(null);
	const keymap = $derived(store?.keymap ?? viewer.keymap);
	/** Label of the action's `index`-th combo, or '' when it has none (unknown action included). */
	const label = $derived.by(() => {
		if (!isKeymapAction(keymap, action)) return '';
		const combo = keymap[action][index];
		return combo ? comboLabel({ [action]: [combo] }, action) : '';
	});
	const keys = $derived(splitComboLabel(label));
	const refAttachment = attachRef<HTMLElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, { 'data-pdf-shortcut': action, 'aria-label': label, ...refAttachment })
	);
</script>

{#if label}
	{#if child}
		{@render child({ props: mergedProps, label, keys })}
	{:else}
		<kbd {...mergedProps}>
			{#if children}{@render children({ label, keys })}{:else}{#each keys as k, i (i)}<kbd
						data-pdf-key="">{k}</kbd
					>{/each}{/if}
		</kbd>
	{/if}
{/if}
