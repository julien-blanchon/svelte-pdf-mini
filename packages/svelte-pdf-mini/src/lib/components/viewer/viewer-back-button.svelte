<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { ViewerContext } from '../../state/context.js';
	import type { ViewerBackButtonProps } from './types.js';

	let {
		forceMount = false,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ViewerBackButtonProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	/** Where "back" goes: the top of the back stack. */
	const to = $derived(viewer.history.back.at(-1) ?? null);
	const snippetProps = $derived({
		page: to?.page ?? null,
		label: to ? viewer.document.pageLabel(to.page) : ''
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-back-button': '',
			'data-state': to ? 'open' : 'closed',
			'aria-label': to ? viewer.t('backToPage', { page: snippetProps.label }) : viewer.t('back'),
			disabled: !to,
			onclick: () => viewer.back(),
			...refAttachment
		})
	);
</script>

{#if to || forceMount}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else}
		<button {...mergedProps}
			>{#if children}{@render children(snippetProps)}{:else}← {viewer.t('backToPage', {
					page: snippetProps.label
				})}{/if}</button
		>
	{/if}
{/if}
