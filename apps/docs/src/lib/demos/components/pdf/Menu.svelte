<!-- Minimal dropdown (native <details>), closes on outside click. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children, align = 'right', class: className = '' }: { label: Snippet; children: Snippet<[{ close: () => void }]>; align?: 'left' | 'right'; class?: string } = $props();
	let details: HTMLDetailsElement | null = $state(null);
	const close = () => details && (details.open = false);
	$effect(() => {
		const onDown = (e: PointerEvent) => details?.open && !details.contains(e.target as Node) && close();
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	});
</script>

<details bind:this={details} class="relative {className}">
	<summary class="flex h-8 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-sm text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/60 [&::-webkit-details-marker]:hidden">{@render label()}</summary>
	<div class="absolute top-full z-50 mt-1 min-w-48 rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-xl dark:border-stone-700 dark:bg-stone-900 {align === 'right' ? 'right-0' : 'left-0'}">
		{@render children({ close })}
	</div>
</details>
