<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { FindContext } from '../../state/context.js';
	import type { FindButtonProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: FindButtonProps = $props();
	const find = FindContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const disabled = $derived(find.total === 0);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-find-prev': '',
			'aria-label': find.viewer.t('findPrev'),
			disabled,
			onclick: () => find.prev(),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, disabled })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ disabled })}{:else}↑{/if}</button
	>
{/if}
