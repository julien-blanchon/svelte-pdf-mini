<script lang="ts">
	import { PaperContext, ViewerContext } from '../../state/context.js';
	import { PaperState } from '../../state/paper.svelte.js';
	import type { PaperRootProps } from './types.js';

	let {
		provider,
		auto,
		onAnalyzed,
		cache,
		isolate,
		paper = $bindable(),
		children
	}: PaperRootProps = $props();
	const state = PaperContext.set(
		new PaperState({
			viewer: ViewerContext.get(),
			provider: () => provider,
			auto: () => auto,
			cache: () => cache,
			isolate: () => isolate,
			onAnalyzed: (m) => onAnalyzed?.(m)
		})
	);
	paper = state;
</script>

{@render children?.({ paper: state })}
