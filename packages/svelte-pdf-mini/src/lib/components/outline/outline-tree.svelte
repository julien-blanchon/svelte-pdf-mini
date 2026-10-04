<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { OutlineContext } from '../../state/context.js';
	import type { OutlineItem } from '../../state/outline.svelte.js';
	import Item from './outline-item.svelte';
	import {
		handleTreeKey,
		shownTree,
		treeItemsAround,
		treeTabStop,
		type TreeKeyModel
	} from '../../internal/tree-keyboard.js';
	import type { OutlineTreeProps } from './types.js';

	let {
		item: itemSnippet,
		empty,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: OutlineTreeProps = $props();
	const outline = OutlineContext.get();

	// Roving focus: one tab stop, arrows move between the shown items.
	const tree = $derived(shownTree(outline.items, (item) => outline.isExpanded(item)));
	let focused = $state.raw<OutlineItem | null>(null);
	const tabStop = $derived(treeTabStop(tree, focused, outline.activePath));
	const keyModel: TreeKeyModel<OutlineItem> = {
		get tree() {
			return tree;
		},
		isBranch: (item) => item.children.length > 0,
		isOpen: (item) => outline.isExpanded(item),
		setOpen: (item, open) => outline.toggle(item, open)
	};

	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLDivElement }) {
		const { elements, index } = treeItemsAround(e.currentTarget, e.target);
		const item = tree.items[index];
		if (!item) return;
		handleTreeKey(e, item, keyModel, (i) =>
			elements[i]?.querySelector<HTMLElement>('[data-pdf-outline-item]')?.focus()
		);
	}

	function onfocusin(e: FocusEvent & { currentTarget: HTMLDivElement }) {
		const { index } = treeItemsAround(e.currentTarget, e.target);
		focused = tree.items[index] ?? focused;
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-outline-tree': '',
			role: 'tree',
			onkeydown,
			onfocusin,
			...refAttachment
		})
	);
</script>

{#snippet branch(items: OutlineItem[])}
	<ul role="group" data-pdf-outline-group="">
		{#each items as item (item.id)}
			{@const expanded = outline.isExpanded(item)}
			{@const hasChildren = item.children.length > 0}
			<li
				role="treeitem"
				aria-level={item.depth + 1}
				aria-expanded={hasChildren ? expanded : undefined}
				aria-selected={outline.activeId === item.id}
				data-depth={item.depth}
			>
				<div data-pdf-outline-row="" style:--pdf-depth={item.depth}>
					{#if hasChildren}
						<!-- Pointer only: the keyboard opens and closes with Right / Left. -->
						<button
							type="button"
							tabindex={-1}
							data-pdf-outline-toggle=""
							data-state={expanded ? 'open' : 'closed'}
							aria-label={outline.viewer.t(expanded ? 'collapse' : 'expand')}
							onclick={() => outline.toggle(item)}>{expanded ? '▾' : '▸'}</button
						>
					{:else}
						<span data-pdf-outline-spacer="" aria-hidden="true"></span>
					{/if}
					<Item {item} tabindex={item === tabStop ? 0 : -1}>
						{#snippet children(p)}
							{#if itemSnippet}{@render itemSnippet(p)}{:else}{item.title}{/if}
						{/snippet}
					</Item>
				</div>
				{#if hasChildren && expanded}
					{@render branch(item.children)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<div {...mergedProps}>
	{#if outline.items.length}
		{@render branch(outline.items)}
	{:else if outline.status === 'empty'}
		{@render empty?.()}
	{/if}
</div>

<style>
	/* Structural layout only (zero specificity: themes and user styles win). */
	:global(:where([data-pdf-outline-group])) {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	:global(:where([data-pdf-outline-row])) {
		display: flex;
		align-items: center;
		padding-inline-start: calc(var(--pdf-depth, 0) * var(--pdf-outline-indent, 12px));
	}
	:global(:where([data-pdf-outline-spacer])) {
		display: inline-block;
		width: var(--pdf-outline-toggle-size, 1.25em);
	}
	:global(:where([data-pdf-outline-row] > [data-pdf-outline-item])) {
		flex: 1;
		min-width: 0;
		text-align: start;
	}
</style>
