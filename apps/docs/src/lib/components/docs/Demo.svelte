<!--
	Live demo (src/lib/demos/examples/<name>), with its
	source files as tabs. Loaded lazily so a page only pays for its own demos.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Component } from 'svelte';
	import { Tooltip } from 'bits-ui';
	import ComponentPreview from './ComponentPreview.svelte';

	let { example, height = 560, file = 'Example.svelte', wide = false, code = true }: { example: string; height?: number; file?: string; wide?: boolean; code?: boolean } = $props();

	const components = import.meta.glob<{ default: Component }>('/src/lib/demos/examples/*/*.svelte');
	const sources = import.meta.glob<string>('/src/lib/demos/examples/*/*.svelte', { query: '?raw', import: 'default' });
	const prefix = '/src/lib/demos/examples/';

	let Demo = $state<Component | null>(null);
	let files = $state<{ name: string; code: string; language: string }[]>([]);
	let error = $state<string | null>(null);

	$effect(() => {
		const key = `${prefix}${example}/${file}`;
		const load = components[key];
		if (!load) {
			error = `Unknown example "${example}"`;
			return;
		}
		let alive = true;
		load().then((m) => alive && (Demo = m.default));
		const keys = Object.keys(sources).filter((k) => k.startsWith(`${prefix}${example}/`));
		Promise.all(keys.map(async (k) => ({ name: k.slice(k.lastIndexOf('/') + 1), code: await sources[k](), language: 'svelte' }))).then((list) => {
			if (!alive) return;
			// The demo's main file first, then the others alphabetically.
			const rank = (f: { name: string }) => (f.name === file ? 0 : 1);
			files = list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
		});
		return () => {
			alive = false;
		};
	});
</script>

{#snippet preview()}
	<div class="relative w-full overflow-hidden rounded-md bg-background text-left text-sm" style:height="{height}px" data-demo={example} data-demo-wide={wide || undefined}>
		<a href={resolve('/demo/[slug]', { slug: example })} target="_blank" class="absolute right-2 bottom-2 z-30 grid size-7 place-items-center rounded-md bg-background/80 text-foreground-muted backdrop-blur hover:text-foreground" title="Open full screen" aria-label="Open full screen"><span class="icon-[lucide--maximize-2] size-3.5"></span></a>
		{#if Demo}
			<!-- The demos' recipe kit uses bits-ui tooltips. -->
			<Tooltip.Provider delayDuration={300}><Demo /></Tooltip.Provider>
		{:else if error}
			<p class="p-6 text-foreground-muted">{error}</p>
		{:else}
			<div class="grid h-full place-items-center text-foreground-muted"><span class="icon-[lucide--loader-circle] size-5 animate-spin"></span></div>
		{/if}
	</div>
{/snippet}

{#if code}
	<ComponentPreview sources={files}>{@render preview()}</ComponentPreview>
{:else}
	{@render preview()}
{/if}
