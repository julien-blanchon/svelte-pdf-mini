<!--
	Color swatches as an ARIA radio group (roving tabindex): Tab enters on the
	checked swatch, arrows move and pick, Home/End jump. Used by the popover and
	the selection menu; apps can build their own from store.palette.
-->
<script lang="ts">
	import { dataAttr } from '../../internal/types.js';
	import { handleRovingKey } from '../../internal/roving.js';
	import { AnnotationsContext } from '../../state/context.js';

	interface Props {
		/** Checked palette key. */
		value?: string;
		onSelect: (key: string) => void;
		/** How many palette entries to show. Default 9 (the 1–9 shortcuts). */
		limit?: number;
		label?: string;
	}

	let { value, onSelect, limit = 9, label }: Props = $props();
	const store = AnnotationsContext.get();
	const swatches = $derived(store.palette.slice(0, limit));
	/** The tab stop: the checked swatch, else the first. */
	const current = $derived(
		Math.max(
			0,
			swatches.findIndex((c) => c.key === value)
		)
	);
	const buttons = $state<HTMLButtonElement[]>([]);

	function onKeydown(e: KeyboardEvent, i: number) {
		// Radio pattern: moving focus also checks.
		handleRovingKey(e, i, swatches.length, {
			orientation: 'both',
			focus: (next) => {
				onSelect(swatches[next].key);
				buttons[next]?.focus();
			}
		});
	}
</script>

<div role="radiogroup" aria-label={label ?? store.viewer.t('color')} data-part="swatches">
	{#each swatches as c, i (c.key)}
		<button
			type="button"
			role="radio"
			bind:this={buttons[i]}
			aria-checked={value === c.key}
			tabindex={i === current ? 0 : -1}
			data-part="swatch"
			data-color={c.key}
			data-active={dataAttr(value === c.key)}
			aria-label={c.label}
			title="{c.label} ({i + 1})"
			style:--swatch={c.light}
			onclick={() => onSelect(c.key)}
			onkeydown={(e) => onKeydown(e, i)}
		></button>
	{/each}
</div>
