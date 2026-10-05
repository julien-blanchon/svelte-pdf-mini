<script lang="ts">
	import { watch } from 'runed';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { float } from '../../internal/floating.js';
	import Markdown from '../../internal/Markdown.svelte';
	import { hasMarkup, renderMarkdown } from '../../internal/markdown.js';
	import { AnnotationsContext } from '../../state/context.js';
	import { annotationSelector, hasNote, snippetPropsFor } from './helpers.js';
	import type { AnnotationsHoverCardProps } from './types.js';

	let {
		forceMount = false,
		onOpenChange,
		placement = 'top',
		delay = 250,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: AnnotationsHoverCardProps = $props();
	const store = AnnotationsContext.get();
	let el: HTMLElement | null = $state(null);
	/** The annotation shown now (after the delay). */
	let shownId = $state<string | null>(null);
	/** The last one shown, kept while closed for `forceMount` exit transitions. */
	let lastId = $state<string | null>(null);

	// Show the hovered annotation's note after a short delay (not when it is selected: the popover shows it).
	// A side note already shows the whole note (and see `hasNote` for boxes).
	$effect(() => {
		const id = store.hoveredId;
		const a = id ? store.byId.get(id) : null;
		const inNote = !!store.hoverAnchor?.closest('[data-pdf-margin-note]');
		const more = a && !inNote && hasNote(a);
		const show =
			a && more && !store.isSelected(a.id) && !store.viewer.selection.selecting ? a.id : null;
		// Render the note during the delay, so the card opens at its final size.
		if (show && a?.contents && hasMarkup(a.contents))
			void renderMarkdown(a.contents).catch(() => {});
		const t = setTimeout(
			() => {
				shownId = show;
				if (show) lastId = show;
			},
			show ? delay : 120
		);
		return () => clearTimeout(t);
	});
	const open = $derived(!!shownId);
	// Changes only (not the initial state), untracked: the callback's reads don't re-run it.
	watch(
		() => open,
		(o) => onOpenChange?.(o),
		{ lazy: true }
	);

	const annotationId = $derived(shownId ?? (forceMount ? lastId : null));
	const annotation = $derived(annotationId ? (store.byId.get(annotationId) ?? null) : null);
	const reference = $derived.by(() => {
		if (!annotation) return null;
		return (
			store.hoverAnchor ??
			store.viewer.scrollEl?.querySelector(annotationSelector(annotation.id)) ??
			null
		);
	});

	$effect(() => {
		if (!annotation || !el || !reference || !open) return;
		return float(reference, el, placement);
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-hover-card': '',
			'data-state': open ? 'open' : 'closed',
			// The app runs its own transitions: no default entry animation.
			'data-force-mount': forceMount ? '' : undefined,
			role: 'tooltip',
			...refAttachment
		})
	);
</script>

{#if annotation && reference}
	{@const snippetProps = {
		...snippetPropsFor(store, annotation),
		open,
		selected: false,
		hovered: true
	}}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else if open}
		<div {...mergedProps} style:--annotation-color={snippetProps.color}>
			{#if children}
				{@render children(snippetProps)}
			{:else}
				{#if annotation.label}<strong data-part="label">{annotation.label}</strong>{/if}
				{#if annotation.contents}<div data-part="contents">
						<Markdown source={annotation.contents} />
					</div>{/if}
				{#if annotation.author?.name}<span data-part="meta">{annotation.author.name}</span>{/if}
			{/if}
		</div>
	{/if}
{/if}

<style>
	@layer svelte-pdf-mini {
		/* Positioned by floating-ui (fixed strategy); never in the way of the pointer. */
		:global(:where([data-pdf-annotation-hover-card])) {
			position: fixed;
			left: 0;
			top: 0;
			z-index: 45;
			pointer-events: none;
		}
	}
</style>
