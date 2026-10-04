<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import type { PageNavButtonProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: PageNavButtonProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const disabled = $derived(!viewer.canGoPrev);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-page-prev': '',
			'aria-label': viewer.t('prevPage'),
			disabled,
			onclick: () => viewer.prevPage(),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, disabled })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ disabled })}{:else}‹{/if}</button
	>
{/if}
