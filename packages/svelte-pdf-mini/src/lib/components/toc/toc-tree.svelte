<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Section } from '../../core/paper/types.js';
	import { PaperContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import {
		handleTreeKey,
		shownTree,
		treeItemsAround,
		treeTabStop,
		type TreeKeyModel
	} from '../../internal/tree-keyboard.js';
	import { itemProps, sectionTitle } from './shared.js';
	import type { TocTreeProps } from './types.js';

	let {
		maxDepth = 3,
		item,
		empty,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: TocTreeProps = $props();
	const paper = PaperContext.get();

	// Roving focus over the shown sections (always open down to maxDepth).
	const tree = $derived(shownTree(paper.sections, (_s, depth) => depth < maxDepth));
	let focused = $state.raw<Section | null>(null);
	const tabStop = $derived(treeTabStop(tree, focused, paper.activePath));
	const keyModel: TreeKeyModel<Section> = {
		get tree() {
			return tree;
		},
		// Sections past maxDepth are not shown, so their parent is a leaf here.
		isBranch: (s) => s.children.length > 0 && tree.parents.has(s.children[0]),
		isOpen: () => true
	};

	/** The element to focus in a tree item: our button, or the first focusable of an `item` snippet. */
	const focusTarget = (li: HTMLElement | undefined) =>
		li?.querySelector<HTMLElement>('[data-pdf-toc-item], a[href], button, [tabindex]');

	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLDivElement }) {
		const { elements, index } = treeItemsAround(e.currentTarget, e.target);
		const section = tree.items[index];
		if (!section) return;
		handleTreeKey(e, section, keyModel, (i) => focusTarget(elements[i])?.focus());
	}

	function onfocusin(e: FocusEvent & { currentTarget: HTMLDivElement }) {
		const { index } = treeItemsAround(e.currentTarget, e.target);
		focused = tree.items[index] ?? focused;
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-toc': 'tree',
			role: 'navigation',
			'aria-label': paper.viewer.t('toc'),
			onkeydown,
			onfocusin,
			...refAttachment
		})
	);
</script>

{#snippet branch(list: Section[], depth: number)}
	<ul role={depth === 1 ? 'tree' : 'group'} data-pdf-toc-group="">
		{#each list as s (s.id)}
			{@const p = itemProps(paper, s, depth)}
			<!-- Toc.Tree is always fully open: parents are expanded. -->
			<li
				role="treeitem"
				aria-level={depth}
				aria-selected={p.active}
				aria-expanded={s.children.length ? true : undefined}
				data-depth={depth}
			>
				{#if item}
					{@render item(p)}
				{:else}
					<button
						type="button"
						tabindex={s === tabStop ? 0 : -1}
						data-pdf-toc-item=""
						data-depth={depth}
						data-active={dataAttr(p.active)}
						data-in-path={dataAttr(p.inPath)}
						aria-current={p.active ? 'location' : undefined}
						style:--pdf-depth={depth}
						onclick={p.go}>{sectionTitle(s)}</button
					>
				{/if}
				{#if s.children.length && depth < maxDepth}{@render branch(s.children, depth + 1)}{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<div {...mergedProps}>
	{#if paper.sections.length}
		{@render branch(paper.sections, 1)}
	{:else}
		{@render empty?.({ status: paper.status })}
	{/if}
</div>

<style>
	:global(:where([data-pdf-toc-group])) {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/*
	 * Indent by depth. Not zero-specificity: it must beat the theme's
	 * `[data-pdf-toc-item] { all: unset }` and single-class overrides of the
	 * padding, which the former inline style also won against.
	 */
	:global([data-pdf-toc='tree'] [data-pdf-toc-item][data-depth]) {
		padding-inline-start: calc((var(--pdf-depth, 1) - 1) * var(--pdf-toc-indent, 12px));
	}
</style>
