<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { PageContext, ViewerContext } from '../../state/context.js';
	import { PageState } from '../../state/page.svelte.js';
	import type { ViewerPageProps } from './types.js';

	let { pageNumber, ref = $bindable(null), child, children, ...rest }: ViewerPageProps = $props();
	const page = PageContext.set(new PageState(ViewerContext.get(), () => pageNumber));
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(mergeProps(rest, page.props, refAttachment));
</script>

{#if child}
	{@render child({ props: mergedProps, ...page.snippetProps })}
{:else}
	<div {...mergedProps}>{@render children?.(page.snippetProps)}</div>
{/if}
