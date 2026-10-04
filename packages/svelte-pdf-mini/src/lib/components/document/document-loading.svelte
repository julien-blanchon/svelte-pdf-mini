<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { DocumentContext } from '../../state/context.js';
	import type { DocumentLoadingProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: DocumentLoadingProps = $props();
	const doc = DocumentContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const progress = $derived(doc.progress);
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-loading': '',
			role: 'progressbar',
			'aria-valuemin': 0,
			'aria-valuemax': 100,
			'aria-valuenow': Number.isFinite(progress) ? Math.round(progress * 100) : undefined,
			'aria-busy': 'true',
			...refAttachment
		})
	);
</script>

{#if doc.status === 'loading'}
	{#if child}
		{@render child({ props: mergedProps, progress })}
	{:else}
		<div {...mergedProps}>{@render children?.({ progress })}</div>
	{/if}
{/if}
