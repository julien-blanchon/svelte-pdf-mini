<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { FindContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import type { FindResultProps } from './types.js';

	let { match, ref = $bindable(null), child, children, ...rest }: FindResultProps = $props();
	const find = FindContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const active = $derived(find.current === match.index);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-find-result': '',
			'data-page': match.page,
			'data-active': dataAttr(active),
			'aria-current': active ? ('true' as const) : undefined,
			onclick: () => find.goTo(match.index),
			...refAttachment
		})
	);
	// Keep the active result visible in its list.
	$effect(() => {
		if (active && ref) ref.scrollIntoView({ block: 'nearest' });
	});
</script>

{#if child}
	{@render child({ props: mergedProps, active, match })}
{:else}
	<button {...mergedProps}>
		{#if children}
			{@render children({ active, match })}
		{:else}
			<span data-part="page">p. {find.viewer.document.pageLabel(match.page)}</span>
			<span data-part="snippet"
				>{match.snippet.before}<mark>{match.snippet.match}</mark>{match.snippet.after}</span
			>
		{/if}
	</button>
{/if}
