<script module lang="ts">
	export const meta = {
		title: 'Zoom',
		description: 'Every zoom change is eased: the select, the slider (both bits-ui recipes calling viewer.zoomTo), fit-mode switches, steps and Ctrl/⌘ + wheel or pinch. Narrow pages stay centred; wide ones zoom under the cursor. Zoomed-out pages are rendered at up to 2× so zooming back in stays sharp.',
		order: 2,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Viewer, Zoom, type ZoomMode } from 'svelte-pdf-mini';
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import Tip from '#lib/demos/components/ui/Tip.svelte';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import ZoomSelect from '#lib/demos/components/ui/ZoomSelect.svelte';
	import ZoomSlider from '#lib/demos/components/ui/ZoomSlider.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let zoom = $state(1);
	let zoomMode = $state<ZoomMode>('page-width');
	let smoothZoom = $state(true);
	let oversampling = $state(true);
	const btn = 'grid size-8 place-items-center rounded-md text-stone-600 hover:bg-stone-200/70 disabled:opacity-35 dark:text-stone-300 dark:hover:bg-stone-700/60';
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root bind:zoom bind:zoomMode {smoothZoom} {oversampling} class="flex h-full flex-col">
		{#snippet children({ viewer })}
			<div class="flex flex-wrap items-center gap-1.5 border-b border-stone-200 p-2 text-sm dark:border-stone-800">
				<Tip label="Zoom out">{#snippet child({ props })}<Zoom.Out {...props} class={btn}><span class="{icons.zoomOut} size-4"></span></Zoom.Out>{/snippet}</Tip>
				<ZoomSelect {viewer} />
				<Tip label="Zoom in">{#snippet child({ props })}<Zoom.In {...props} class={btn}><span class="{icons.zoomIn} size-4"></span></Zoom.In>{/snippet}</Tip>
				<Separator />
				<ZoomSlider {viewer} />
				<Separator />
				<ToggleGroup
					label="Fit mode"
					bind:value={() => zoomMode, (m) => (viewer.zoomMode = m)}
					items={[
						{ value: 'page-width', label: 'Width', icon: 'icon-[lucide--move-horizontal]' },
						{ value: 'page-fit', label: 'Page', icon: 'icon-[lucide--maximize]' },
						{ value: 'auto', label: 'Auto', icon: 'icon-[lucide--wand-sparkles]' },
						{ value: 'manual', label: 'Manual', icon: 'icon-[lucide--hand]' }
					]}
				/>
				<div class="ml-auto flex items-center gap-3 text-xs text-stone-500">
					<label class="flex items-center gap-1"><input type="checkbox" bind:checked={smoothZoom} /> smooth</label>
					<label class="flex items-center gap-1"><input type="checkbox" bind:checked={oversampling} /> oversample</label>
					<span class="w-36 text-right whitespace-nowrap tabular-nums">{Math.round(zoom * 100)}% · {zoomMode}</span>
				</div>
			</div>
			<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900">
				<Viewer.Pages />
			</Viewer.Viewport>
		{/snippet}
	</Viewer.Root>
</Document.Root>
