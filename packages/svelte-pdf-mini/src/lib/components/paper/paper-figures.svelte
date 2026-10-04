<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Attachment } from 'svelte/attachments';
	import { renderRegionToCanvas } from '../../core/document/render.js';
	import { PaperContext } from '../../state/context.js';
	import type { Figure } from '../../core/paper/types.js';
	import type { PaperFiguresProps } from './types.js';

	let {
		kinds,
		thumbnails = true,
		thumbnailWidth = 220,
		item,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: PaperFiguresProps = $props();
	const paper = PaperContext.get();
	const figures = $derived(
		kinds ? paper.figures.filter((f) => kinds.includes(f.kind)) : paper.figures
	);

	/** Lazy crop thumbnail: rendered once the element scrolls near the view. */
	const thumbnail =
		(f: Figure): Attachment<HTMLElement> =>
		(node) => {
			let alive = true;
			const render = async () => {
				const page = await paper.viewer.document.getPage(f.page);
				const canvas = await renderRegionToCanvas({ page, rect: f.rect, cssWidth: thumbnailWidth });
				if (alive) node.replaceChildren(canvas);
			};
			const io = new IntersectionObserver(
				([entry]) => {
					if (!entry.isIntersecting) return;
					io.disconnect();
					render().catch(() => {});
				},
				{ rootMargin: '200px' }
			);
			io.observe(node);
			return () => {
				alive = false;
				io.disconnect();
			};
		};

	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, { 'data-pdf-figures': '', role: 'list', ...refAttachment })
	);
</script>

{#if child}
	{@render child({ props: mergedProps, figures })}
{:else}
	<div {...mergedProps}>
		{#if children}
			{@render children({ figures })}
		{:else}
			{#each figures as f (f.id)}
				<div role="listitem" data-pdf-figure="" data-kind={f.kind}>
					{#if item}
						{@render item({ figure: f, go: () => paper.goToFigure(f) })}
					{:else}
						<button type="button" data-part="open" onclick={() => paper.goToFigure(f)}>
							{#if thumbnails}<div data-part="thumbnail" {@attach thumbnail(f)}></div>{/if}
							<span data-part="label">{f.label}</span>
							<span data-part="caption">{f.caption}</span>
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/if}
