<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { FindContext } from '../../state/context.js';
	import type { FindCountProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: FindCountProps = $props();
	const find = FindContext.get();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const snippetProps = $derived({
		current: find.current + 1,
		total: find.total,
		status: find.status
	});

	/** Default text: "3 / 12", "…" while searching, or "no results" (empty without a query). */
	const summary = $derived.by(() => {
		if (!find.query.trim()) return '';
		if (find.total) return `${Math.max(1, snippetProps.current)} / ${find.total}`;
		if (find.status === 'searching') return '…';
		return find.viewer.t('findNoResults');
	});

	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-find-count': '',
			'data-status': find.status,
			role: 'status',
			'aria-live': 'polite' as const,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, ...snippetProps })}
{:else}
	<div {...mergedProps}>
		{#if children}{@render children(snippetProps)}{:else if summary}{summary}{/if}
	</div>
{/if}
