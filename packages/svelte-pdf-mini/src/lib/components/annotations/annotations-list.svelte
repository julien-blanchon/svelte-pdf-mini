<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Annotation } from '../../core/annotations/model.js';
	import Markdown from '../../internal/Markdown.svelte';
	import { AnnotationsContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { annotationCss } from './color.js';
	import { quoteOf, snippetPropsFor } from './helpers.js';
	import type { AnnotationsListProps, ListItemSnippetProps } from './types.js';

	let {
		filter,
		item,
		empty,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: AnnotationsListProps = $props();
	const store = AnnotationsContext.get();
	const list = $derived(filter ? store.ordered.filter(filter) : store.ordered);
	/** Select the annotation and scroll it into the middle of the view (selected is enough: no flash). */
	function go(a: Annotation) {
		store.select(a.id);
		store.viewer.navigate({ page: a.page, rect: a.rect }, { highlight: false, align: 'center' });
	}
	// The list lives outside the pages: always the light color.
	const itemProps = (a: Annotation): ListItemSnippetProps => ({
		...snippetPropsFor(store, a, annotationCss(a, store.palette, false)),
		quote: quoteOf(a),
		pageLabel: store.viewer.document.pageLabel(a.page),
		go: () => go(a)
	});
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, { 'data-pdf-annotation-list': '', role: 'list', ...refAttachment })
	);
</script>

{#if child}
	{@render child({ props: mergedProps, annotations: list })}
{:else}
	<div {...mergedProps}>
		{#if children}
			{@render children({ annotations: list })}
		{:else if !list.length}
			{@render empty?.()}
		{:else}
			{#each list as a (a.id)}
				{@const props = itemProps(a)}
				<div
					role="listitem"
					data-pdf-annotation-list-item=""
					data-kind={a.kind}
					data-selected={dataAttr(props.selected)}
					style:--annotation-color={props.color}
				>
					{#if item}
						{@render item(props)}
					{:else}
						<button
							type="button"
							data-part="open"
							aria-current={props.selected ? 'true' : undefined}
							onclick={props.go}
						>
							<span data-part="page">{store.viewer.t('pageShort', { page: props.pageLabel })}</span>
							{#if a.label}<strong data-part="label">{a.label}</strong>{/if}
							{#if props.quote}<span data-part="quote">{props.quote}</span>{/if}
							{#if a.contents}<span data-part="contents"><Markdown source={a.contents} /></span
								>{/if}
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/if}
