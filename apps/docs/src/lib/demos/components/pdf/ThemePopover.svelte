<!-- Reading theme picker: day/night, paper colour (ColorPicker recipe), strength and page frame. -->
<script lang="ts">
	import { Popover, Slider } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import ColorPicker from '../ui/ColorPicker.svelte';
	import ToggleGroup from '../ui/ToggleGroup.svelte';
	import Tip from '../ui/Tip.svelte';
	import { cn } from '../ui/cn.ts';
	import { paperSwatches, type PageFrame, type ReadingTheme } from './reading-theme.svelte.ts';

	let { theme, frames = true, class: className }: { theme: ReadingTheme; frames?: boolean; class?: string } = $props();
</script>

<Popover.Root>
	<Tip label="Reading theme">
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label="Reading theme" class={cn('grid size-8 place-items-center rounded-md outline-none hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=open]:bg-stone-200/70 dark:hover:bg-stone-700/60 dark:data-[state=open]:bg-stone-700/60', className)}>
				<span class="size-4.5 rounded-full shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.25)]" style:background={theme.swatch}></span>
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={8} align="end" forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-50 w-72 space-y-4 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-800 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
							<div class="flex items-center justify-between">
								<span class="font-medium">Reading theme</span>
								<ToggleGroup label="Day or night" bind:value={() => (theme.dark ? 'night' : 'day'), (v) => (theme.dark = v === 'night')} items={[{ value: 'day', label: 'Day', icon: 'icon-[lucide--sun]' }, { value: 'night', label: 'Night', icon: 'icon-[lucide--moon]' }]} />
							</div>
							<div class="space-y-1.5">
								<p class="text-xs text-stone-500">Paper colour</p>
								<ColorPicker label="Paper colour" bind:value={theme.color} swatches={paperSwatches} size="sm" />
							</div>
							<div class="space-y-1.5">
								<p class="flex justify-between text-xs text-stone-500"><span>Tint strength</span><span class="tabular-nums">{Math.round(theme.strength * 100)}%</span></p>
								<Slider.Root type="single" min={0} max={1} step={0.05} bind:value={theme.strength} aria-label="Tint strength" class="relative flex h-4 touch-none items-center">
									<span class="relative h-1 w-full rounded-full bg-stone-200 dark:bg-stone-700"><Slider.Range class="absolute h-full rounded-full bg-stone-500" /></span>
									<Slider.Thumb index={0} class="block size-4 rounded-full border border-stone-300 bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
								</Slider.Root>
							</div>
							{#if frames}
								<div class="space-y-1.5">
									<p class="text-xs text-stone-500">Page edge</p>
									<ToggleGroup label="Page frame" bind:value={() => theme.frame, (v: PageFrame) => (theme.frame = v)} items={[{ value: 'shadow', label: 'Shadow' }, { value: 'border', label: 'Border' }, { value: 'rounded', label: 'Rounded' }, { value: 'flat', label: 'Flat' }]} />
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
