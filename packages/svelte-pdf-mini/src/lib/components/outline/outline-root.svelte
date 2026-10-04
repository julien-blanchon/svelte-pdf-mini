<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { OutlineContext, ViewerContext } from '../../state/context.js';
	import { OutlineState } from '../../state/outline.svelte.js';
	import type { OutlineRootProps } from './types.js';

	let {
		expandDepth = 1,
		outline = $bindable(),
		ref = $bindable(null),
		child,
		children,
		...rest
	}: OutlineRootProps = $props();
	// svelte-ignore state_referenced_locally
	const state = OutlineContext.set(new OutlineState(ViewerContext.get(), { expandDepth }));
	outline = state;
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-outline': '',
			'data-status': state.status,
			role: 'navigation',
			'aria-label': state.viewer.t('outline'),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, outline: state })}
{:else}
	<div {...mergedProps}>{@render children?.({ outline: state })}</div>
{/if}
