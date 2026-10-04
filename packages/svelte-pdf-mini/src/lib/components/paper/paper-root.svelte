<script lang="ts">
	import { PaperContext, ViewerContext } from '../../state/context.js';
	import { PaperState } from '../../state/paper.svelte.js';
	import type { PaperRootProps } from './types.js';

	let { provider, auto, onAnalyzed, paper = $bindable(), children }: PaperRootProps = $props();
	const state = PaperContext.set(
		new PaperState({
			viewer: ViewerContext.get(),
			provider: () => provider,
			auto: () => auto,
			onAnalyzed: (m) => onAnalyzed?.(m)
		})
	);
	paper = state;
</script>

{@render children?.({ paper: state })}
