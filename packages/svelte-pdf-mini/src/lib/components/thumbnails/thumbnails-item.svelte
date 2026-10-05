<script lang="ts">
	import { untrack } from 'svelte';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey } from 'svelte/attachments';
	import { ViewerContext } from '../../state/context.js';
	import { thumbnailCache } from '../../state/thumbnails.svelte.js';
	import { dataAttr } from '../../internal/types.js';
	import { rotatedSize } from '../../core/view/zoom.js';
	import { ThumbnailsContext } from './thumbnails-root.svelte';
	import type { ThumbnailCanvasProps, ThumbnailsItemProps } from './types.js';

	let {
		pageNumber,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ThumbnailsItemProps = $props();
	const viewer = ViewerContext.get();
	const ctx = ThumbnailsContext.get();
	const cache = thumbnailCache(viewer.document);
	let visible = $state(false);
	let rendered = $state(false);
	let canvasHost: HTMLElement | null = $state(null);

	const isCurrent = $derived(viewer.page === pageNumber);
	const label = $derived(viewer.document.pageLabel(pageNumber));
	const size = $derived(rotatedSize(viewer.document.pageSize(pageNumber), 0));
	const height = $derived((ctx.width * size.height) / size.width);

	// Render once scrolled near; the current page renders first.
	$effect(() => {
		if (!visible || !canvasHost || !viewer.document.proxy) return;
		let alive = true;
		const host = canvasHost;
		// Priority only: becoming current must not copy the bitmap again.
		cache.canvas(pageNumber, ctx.width, untrack(() => isCurrent) ? 1 : 5).then(
			(canvas) => {
				if (!alive) return;
				host.replaceChildren(canvas);
				rendered = true;
			},
			() => {}
		);
		return () => {
			alive = false;
		};
	});

	$effect(() => {
		if (isCurrent && ctx.follow && ref)
			ref.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	const observeKey = createAttachmentKey();
	const observeVisibility = (node: HTMLElement) => ctx.observe(node, () => (visible = true));
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			role: 'option',
			// Roving focus: the current page is the list's tab stop, arrows move (see Thumbnails.Root).
			tabindex: isCurrent ? 0 : -1,
			'data-pdf-thumbnail': pageNumber,
			'data-current': dataAttr(isCurrent),
			'data-rendered': dataAttr(rendered),
			'aria-selected': isCurrent,
			'aria-label': viewer.t('page', { page: label }),
			onclick: () => viewer.goToPage(pageNumber, { behavior: 'instant' }),
			[observeKey]: observeVisibility,
			...refAttachment
		})
	);

	const canvasKey = createAttachmentKey();
	const canvasProps: ThumbnailCanvasProps = {
		'data-pdf-thumbnail-canvas': '',
		[canvasKey]: (node: HTMLElement) => {
			canvasHost = node;
			return () => (canvasHost = null);
		}
	};
</script>

{#if child}
	{@render child({ props: mergedProps, pageNumber, label, isCurrent, rendered, canvasProps })}
{:else}
	<button {...mergedProps}>
		<div
			{...canvasProps}
			style:--pdf-thumbnail-width="{ctx.width}px"
			style:--pdf-thumbnail-height="{height}px"
		></div>
		{#if children}{@render children({ pageNumber, label, isCurrent, rendered })}{:else}<span
				data-part="label">{label}</span
			>{/if}
	</button>
{/if}

<style>
	@layer svelte-pdf-mini {
		/* Placeholder at the thumbnail's size until the canvas arrives. */
		:global(:where([data-pdf-thumbnail-canvas])) {
			width: var(--pdf-thumbnail-width);
			height: var(--pdf-thumbnail-height);
			background: var(--pdf-page-bg, #fff);
		}
	}
</style>
