<script module lang="ts">
	export const meta = {
		title: 'Page themes',
		description: 'pageThemes.paper is the recommended reading theme: by day a soft paper tint (multiply, like sepia), by night a tinted vector recolor (text and plots recoloured, photos untouched). Pick any colour and strength; the raw strategies are listed below for comparison. Page edges come from pageFrame.',
		order: 5,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Slider } from 'bits-ui';
	import { Document, Viewer, pageThemes, paperSwatches, type PageThemeStrategy } from 'svelte-pdf-mini';
	import { ReadingTheme, type PageFrame } from '#lib/demos/components/pdf/reading-theme.svelte.ts';
	import ColorPicker from '#lib/demos/components/ui/ColorPicker.svelte';
	import ToggleGroup from '#lib/demos/components/ui/ToggleGroup.svelte';
	import { arxivPdf } from '#lib/demos/papers.ts';

	const theme = new ReadingTheme({ color: 'warm', strength: 0.5 });
	/** null = the reading theme; otherwise a raw strategy from the comparison list. */
	let raw = $state<number | null>(null);
	const strategies: { label: string; hint: string; theme: PageThemeStrategy }[] = [
		{ label: 'None', hint: 'original', theme: pageThemes.none() },
		{ label: 'Sepia', hint: 'CSS · instant', theme: pageThemes.sepia() },
		{ label: 'Dim', hint: 'CSS · keeps colours', theme: pageThemes.dim() },
		{ label: 'Invert', hint: 'CSS · photos invert too', theme: pageThemes.invert({ saturate: 2, brightness: 1.1 }) },
		{ label: 'Smart invert', hint: 're-render · figures kept', theme: pageThemes.smartInvert() },
		{ label: 'Vector recolor', hint: 're-render · hues kept', theme: pageThemes.vectorRecolor() },
		{ label: 'Duotone', hint: 'pdf.js pageColors', theme: pageThemes.recolor() }
	];
	const active = $derived(raw == null ? theme.strategy : strategies[raw].theme);
	const dark = $derived(raw == null ? theme.dark : !!strategies[raw].theme.dark);
	const card = 'w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-stone-100 data-[active]:bg-stone-900 data-[active]:text-white dark:hover:bg-stone-800 dark:data-[active]:bg-stone-100 dark:data-[active]:text-stone-900';
</script>

<div class="flex h-full">
	<aside class="w-80 shrink-0 space-y-6 overflow-y-auto border-r border-stone-200 p-4 text-sm dark:border-stone-800">
		<section class="space-y-3" data-active={raw == null || undefined}>
			<button class="flex w-full items-center justify-between" onclick={() => (raw = null)}>
				<h2 class="font-medium">Reading theme <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 uppercase dark:bg-emerald-900 dark:text-emerald-100">recommended</span></h2>
				{#if raw != null}<span class="text-xs text-blue-600">use</span>{/if}
			</button>
			<ToggleGroup label="Day or night" bind:value={() => (theme.dark ? 'night' : 'day'), (v) => ((theme.dark = v === 'night'), (raw = null))} items={[{ value: 'day', label: 'Day', icon: 'icon-[lucide--sun]' }, { value: 'night', label: 'Night', icon: 'icon-[lucide--moon]' }]} />
			<div class="space-y-1.5">
				<p class="text-xs text-stone-500">Paper colour (swatches, or the rainbow for any colour)</p>
				<ColorPicker label="Paper colour" bind:value={() => theme.color, (v) => ((theme.color = v), (raw = null))} swatches={paperSwatches} />
			</div>
			<div class="space-y-1.5">
				<p class="flex justify-between text-xs text-stone-500"><span>Strength</span><span class="tabular-nums">{Math.round(theme.strength * 100)}%</span></p>
				<Slider.Root type="single" min={0} max={1} step={0.05} bind:value={() => theme.strength, (v) => ((theme.strength = v), (raw = null))} aria-label="Tint strength" class="relative flex h-4 touch-none items-center">
					<span class="relative h-1 w-full rounded-full bg-stone-200 dark:bg-stone-700"><Slider.Range class="absolute h-full rounded-full bg-stone-500" /></span>
					<Slider.Thumb index={0} class="block size-4 rounded-full border border-stone-300 bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
				</Slider.Root>
			</div>
			<div class="space-y-1.5">
				<p class="text-xs text-stone-500">Page edge (<code>pageFrame</code>)</p>
				<ToggleGroup label="Page frame" bind:value={() => theme.frame, (v: PageFrame) => (theme.frame = v)} items={[{ value: 'shadow', label: 'Shadow' }, { value: 'border', label: 'Border' }, { value: 'rounded', label: 'Rounded' }, { value: 'flat', label: 'Flat' }, { value: 'none', label: 'None' }]} />
			</div>
			<pre class="overflow-x-auto rounded-md bg-stone-100 p-2 text-[11px] dark:bg-stone-900">pageThemes.paper(&#123;
  color: '{theme.color.startsWith('#') ? theme.color : `<${theme.color}>`}',
  dark: {theme.dark},
  strength: {theme.strength}
&#125;)</pre>
		</section>
		<section class="space-y-1">
			<h2 class="mb-2 font-medium">Raw strategies (comparison)</h2>
			{#each strategies as s, i (s.label)}
				<button class={card} data-active={raw === i || undefined} onclick={() => (raw = i)}>
					{s.label} <span class="block text-[11px] opacity-60">{s.hint}</span>
				</button>
			{/each}
		</section>
	</aside>
	<Document.Root src={arxivPdf('1512.03385')}>
		<Viewer.Root pageTheme={active} pageFrame={theme.frame} theme={dark ? 'dark' : 'light'} zoomMode="page-width" class="min-w-0 flex-1">
			<Viewer.Viewport class="h-full transition-colors {dark ? 'bg-stone-900' : 'bg-stone-100'} [--pdf-pages-padding:28px]">
				<Viewer.Pages />
			</Viewer.Viewport>
		</Viewer.Root>
	</Document.Root>
</div>
