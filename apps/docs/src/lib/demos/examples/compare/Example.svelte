<script module lang="ts">
	export const meta = {
		title: 'Compare versions',
		description: 'Two versions of an arXiv paper side by side (v1 and the latest). Scrolling one follows on the other, by page or by matching section. Annotations are shared: highlight in one, it appears in both.',
		order: 103,
		kind: 'app'
	} as const;
</script>

<script lang="ts">
	import type { Annotation, PaperState, ViewerState } from 'svelte-pdf-mini';
	import Side from './Side.svelte';

	const id = '1706.03762';
	let left = $state<{ viewer?: ViewerState; paper?: PaperState }>({});
	let right = $state<{ viewer?: ViewerState; paper?: PaperState }>({});
	let annotations = $state<Annotation[]>([]);
	let mode = $state<'section' | 'page' | 'off'>('section');
	let leader = $state<'left' | 'right'>('left');

	// Follow the side the user is reading.
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const from = leader === 'left' ? left : right;
		const to = leader === 'left' ? right : left;
		const point = from.viewer?.readingPoint;
		if (mode === 'off' || !point || !from.viewer || !to.viewer) return;
		// Also re-run when either side finishes loading or analysing (the other side may not be ready yet).
		void from.paper?.activeSection;
		void to.paper?.flatSections.length;
		void to.viewer.document.status;
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (mode === 'section') {
				const s = from.paper?.activeSection;
				const match = s && to.paper?.flatSections.find((x) => x.title.toLowerCase() === s.title.toLowerCase());
				if (match && to.paper?.activeSection?.id !== match.id) return void to.paper!.goToSection(match);
				if (match) return;
			}
			const target = point.page + point.fraction;
			if (Math.abs(to.viewer!.position - target) > 0.05) to.viewer!.restorePosition(target);
		}, 120);
	});
</script>

<div class="flex h-full flex-col bg-stone-50 dark:bg-stone-950">
	<div class="flex items-center gap-3 border-b border-stone-200 px-3 py-1.5 text-sm dark:border-stone-800">
		<span class="font-medium">Attention Is All You Need · v1 ↔ v7</span>
		<span class="ml-auto text-stone-500">Sync</span>
		{#each ['section', 'page', 'off'] as const as m (m)}
			<button class="rounded px-2 py-0.5 capitalize data-[active]:bg-stone-800 data-[active]:text-white dark:data-[active]:bg-stone-200 dark:data-[active]:text-stone-900" data-active={mode === m || undefined} onclick={() => (mode = m)}>{m}</button>
		{/each}
		<span class="text-xs text-stone-500">{annotations.length} shared annotation{annotations.length === 1 ? '' : 's'}</span>
	</div>
	<div class="flex min-h-0 flex-1 divide-x divide-stone-300 dark:divide-stone-700">
		<Side src="https://arxiv.org/pdf/{id}v1" label="v1 · 2017" bind:annotations bind:viewer={left.viewer} bind:paper={left.paper} onInteract={() => (leader = 'left')} />
		<Side src="https://arxiv.org/pdf/{id}v7" label="v7 · 2023" bind:annotations bind:viewer={right.viewer} bind:paper={right.paper} onInteract={() => (leader = 'right')} />
	</div>
</div>
