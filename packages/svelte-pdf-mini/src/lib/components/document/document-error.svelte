<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { DocumentContext } from '../../state/context.js';
	import type { DocumentErrorProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: DocumentErrorProps = $props();
	const doc = DocumentContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-error': '',
			'data-kind': doc.error?.kind,
			role: 'alert',
			...refAttachment
		})
	);
</script>

{#if doc.status === 'error' && doc.error}
	{#if child}
		{@render child({ props: mergedProps, error: doc.error })}
	{:else}
		<div {...mergedProps}>
			{#if children}{@render children({ error: doc.error })}{:else}{doc.error.message}{/if}
		</div>
	{/if}
{/if}
