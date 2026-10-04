<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { OutlineContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import type { OutlineItemProps, OutlineItemSnippetProps } from './types.js';

	let { item, ref = $bindable(null), child, children, ...rest }: OutlineItemProps = $props();
	const outline = OutlineContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));

	const active = $derived(outline.activeId === item.id);
	/** A descendant (not this item) is the active one. */
	const containsActive = $derived(!active && outline.activePath.includes(item));
	/** Neither a resolved page nor an external link to go to. */
	const unreachable = $derived(item.page == null && !item.url);

	const snippetProps: OutlineItemSnippetProps = $derived({
		item,
		depth: item.depth,
		active,
		containsActive,
		expanded: outline.isExpanded(item),
		hasChildren: item.children.length > 0,
		toggle: () => outline.toggle(item)
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-outline-item': '',
			'data-depth': item.depth,
			'data-active': dataAttr(active),
			'data-contains-active': dataAttr(containsActive),
			'aria-current': active ? ('location' as const) : undefined,
			// Still focusable (tree keyboard navigation passes through it), but inert.
			'aria-disabled': unreachable || undefined,
			'data-disabled': dataAttr(unreachable),
			onclick: () => {
				if (!unreachable) outline.go(item);
			},
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, ...snippetProps })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children(snippetProps)}{:else}{item.title}{/if}</button
	>
{/if}
