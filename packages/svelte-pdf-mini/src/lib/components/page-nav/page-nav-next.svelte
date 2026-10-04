<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import type { PageNavButtonProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: PageNavButtonProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const disabled = $derived(!viewer.canGoNext);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-page-next': '',
			'aria-label': viewer.t('nextPage'),
			disabled,
			onclick: () => viewer.nextPage(),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, disabled })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ disabled })}{:else}›{/if}</button
	>
{/if}
