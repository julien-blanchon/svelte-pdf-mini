<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { cssVars } from '../../internal/style.js';
	import { PageContext } from '../../state/context.js';
	import type { ViewerFocusProps } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: ViewerFocusProps = $props();
	const page = PageContext.get();
	/** The focus region when it is on this page. */
	const region = $derived.by(() => {
		const r = page.viewer.focusRegion;
		return r && r.page === page.pageNumber ? r : null;
	});
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		region
			? mergeProps(rest, {
					'data-pdf-focus': '',
					'data-highlight': region.highlight,
					style: cssVars({
						'--pdf-focus-duration': `${region.duration}ms`,
						'--pdf-focus-left': `${region.left * 100}%`,
						'--pdf-focus-top': `${region.top * 100}%`,
						'--pdf-focus-width': `${region.width * 100}%`,
						'--pdf-focus-height': `${region.height * 100}%`
					}),
					...refAttachment
				})
			: {}
	);
</script>

{#if region}
	<!-- The wrapper clips effects (e.g. spotlight) to the page. -->
	<div data-pdf-focus-clip="">
		{#key region.key}
			{#if child}
				{@render child({
					props: mergedProps,
					highlight: region.highlight,
					duration: region.duration
				})}
			{:else}
				<div {...mergedProps}>
					{@render children?.({ highlight: region.highlight, duration: region.duration })}
				</div>
			{/if}
		{/key}
	</div>
{/if}

<style>
	:global(:where([data-pdf-focus-clip])) {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 3;
	}
	:global(:where([data-pdf-focus])) {
		position: absolute;
		pointer-events: none;
		left: var(--pdf-focus-left);
		top: var(--pdf-focus-top);
		width: var(--pdf-focus-width);
		height: var(--pdf-focus-height);
	}
</style>
