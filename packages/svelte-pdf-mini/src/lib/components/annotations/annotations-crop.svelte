<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { renderRegionToCanvas } from '../../core/document/render.js';
	import type { PdfRect } from '../../core/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { CssVars } from './helpers.js';
	import type { AnnotationsCropProps } from './types.js';

	let {
		annotation,
		width = 240,
		padding = 6,
		ref = $bindable(null),
		child: _child,
		children: _children,
		...rest
	}: AnnotationsCropProps = $props();
	const store = AnnotationsContext.get();
	let host: HTMLDivElement | null = $state(null);
	let visible = $state(false);

	$effect(() => {
		if (!host) return;
		const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
			rootMargin: '200px'
		});
		io.observe(host);
		return () => io.disconnect();
	});

	// Render the region once it nears the viewport; re-render when it (or the document) changes.
	$effect(() => {
		const doc = store.viewer.document;
		const target = host;
		if (!visible || !target || !doc.proxy) return;
		const [x1, y1, x2, y2] = annotation.rect;
		const rect: PdfRect = [x1 - padding, y1 - padding, x2 + padding, y2 + padding];
		const cssWidth = width;
		const controller = new AbortController();
		const { signal } = controller;
		doc
			.getPage(annotation.page)
			.then((page) => renderRegionToCanvas({ page, rect, cssWidth, signal }))
			.then((canvas) => {
				if (!signal.aborted) target.replaceChildren(canvas);
			})
			.catch(() => {
				/* aborted, or the page is gone */
			});
		return () => controller.abort();
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		host = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-crop': '',
			style: { '--pdf-crop-width': `${width}px` } satisfies CssVars,
			...refAttachment
		})
	);
</script>

<div {...mergedProps}></div>

<style>
	[data-pdf-annotation-crop] {
		width: var(--pdf-crop-width);
	}
</style>
