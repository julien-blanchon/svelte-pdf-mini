<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { quadToSvgPoints } from '../../core/view/geometry.js';
	import { FindContext, PageContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import type { FindLayerProps } from './types.js';

	let {
		show = 'all',
		match: matchSnippet,
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: FindLayerProps = $props();
	const find = FindContext.get();
	const page = PageContext.get();
	/** Matches on this page that `show` asks to draw. */
	const matches = $derived.by(() => {
		if (show === 'none') return [];
		const onPage = find.byPage.get(page.pageNumber) ?? [];
		return show === 'current' ? onPage.filter((m) => m.index === find.current) : onPage;
	});
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-find-layer': '',
			'aria-hidden': 'true' as const,
			...refAttachment
		})
	);
</script>

{#if matches.length && page.viewport}
	{@const vp = page.viewport}
	{#if child}
		{@render child({ props: mergedProps })}
	{:else}
		<div {...mergedProps}>
			<svg viewBox="0 0 {vp.width} {vp.height}" preserveAspectRatio="none">
				{#each matches as m (m.index)}
					{@const current = find.current === m.index}
					{#if matchSnippet}
						{@render matchSnippet({
							match: m,
							current,
							points: m.quads.map((q) => quadToSvgPoints(vp, q))
						})}
					{:else}
						{#each m.quads as q, i (i)}
							<polygon
								points={quadToSvgPoints(vp, q)}
								data-pdf-find-match=""
								data-current={dataAttr(current)}
								data-other={dataAttr(!current)}
							/>
						{/each}
					{/if}
				{/each}
			</svg>
		</div>
	{/if}
{/if}

<style>
	:global(:where([data-pdf-find-layer])) {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	:global(:where([data-pdf-find-layer] > svg)) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		mix-blend-mode: multiply;
	}
</style>
