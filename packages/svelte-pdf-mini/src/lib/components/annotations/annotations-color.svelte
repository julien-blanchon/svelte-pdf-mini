<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { CssVars } from './helpers.js';
	import type { AnnotationsColorProps } from './types.js';

	let { color, ref = $bindable(null), child, children, ...rest }: AnnotationsColorProps = $props();
	const store = AnnotationsContext.get();
	const swatch = $derived(store.palette.find((p) => p.key === color));
	const active = $derived(store.color === color);
	function pick() {
		store.color = color;
		// Recolor the selection too, like most editors.
		if (store.selectedIds.length) store.recolor(store.selectedIds, color);
	}
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-annotation-color': color,
			'data-active': dataAttr(active),
			'aria-pressed': active,
			'aria-label': swatch?.label ?? color,
			style: { '--swatch': swatch?.light ?? color } satisfies CssVars,
			onclick: pick,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, active, swatch })}
{:else}
	<button {...mergedProps}>{@render children?.({ active, swatch })}</button>
{/if}
