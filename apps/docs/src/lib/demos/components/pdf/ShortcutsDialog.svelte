<!-- "?" opens a reference of every shortcut, from the active keymap (overrides included). -->
<script lang="ts">
	import { AnnotationsContext, ViewerContext, shortcutGroups } from 'svelte-pdf-mini';
	import { matchesCombo } from 'svelte-pdf-mini/core';
	import Dialog from '../ui/Dialog.svelte';
	import Kbd from '../ui/Kbd.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	const viewer = ViewerContext.get();
	const store = AnnotationsContext.getOr(null);
	const groups = $derived(shortcutGroups(viewer, store));

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
			if ((store?.keymap ?? viewer.keymap)['help.shortcuts'].some((c) => matchesCombo(e, c))) {
				e.preventDefault();
				open = !open;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<Dialog bind:open title="Keyboard shortcuts" class="max-w-3xl">
	<div class="grid gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
		{#each groups as g (g.title)}
			<section>
				<h3 class="mb-1.5 text-xs font-medium tracking-wide text-stone-500 uppercase">{g.title}</h3>
				<ul class="space-y-1 text-sm">
					{#each g.items as it (it.action)}
						<li class="flex items-center justify-between gap-3">
							<span>{it.label}</span>
							<span class="flex gap-1">{#each it.keys.slice(0, 2) as k (k)}<Kbd>{k}</Kbd>{/each}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</Dialog>
