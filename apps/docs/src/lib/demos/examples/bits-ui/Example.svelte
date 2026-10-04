<script module lang="ts">
	export const meta = {
		title: 'bits-ui & melt composition',
		description: 'Our parts and bits-ui primitives compose both ways through the `child` snippet: a bits Tooltip.Trigger renders Zoom.In, our PageNav.Next renders our Button recipe, a bits Popover hosts Toc.Tree, bits Select / Slider are controlled by the viewer state, and floating parts (ours and bits) animate with forceMount + Svelte transitions.',
		order: 25,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Popover, Select, Slider, Tooltip } from 'bits-ui';
	import { fly, scale } from 'svelte/transition';
	import { Document, PageNav, Paper, Toc, Viewer, Zoom, type ScrollMode } from 'svelte-pdf-mini';
	import Button from '#lib/demos/components/ui/Button.svelte';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let scrollMode = $state<ScrollMode>('vertical');
	const modes: { value: ScrollMode; label: string }[] = [
		{ value: 'vertical', label: 'Vertical' },
		{ value: 'horizontal', label: 'Horizontal' },
		{ value: 'wrapped', label: 'Wrapped' },
		{ value: 'page', label: 'Single page' }
	];
	const tip = 'z-50 rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow dark:bg-stone-100 dark:text-stone-900';
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root bind:scrollMode zoomMode="page-width" class="flex h-full flex-col">
		{#snippet children({ viewer })}
			<Paper.Root>
				<div class="flex flex-wrap items-center gap-1.5 border-b border-stone-200 p-2 text-sm dark:border-stone-800">
					<!-- 1. bits → ours: Tooltip.Trigger's `child` renders our Zoom.In; its props
					     (aria, handlers, ref attachment) merge with Zoom.In's own. -->
					<Tooltip.Root delayDuration={200}>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Zoom.In {...props} class="grid size-8 place-items-center rounded-md hover:bg-stone-200/70 dark:hover:bg-stone-700/60"><span class="icon-[lucide--zoom-in] size-4"></span></Zoom.In>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Portal>
							<Tooltip.Content sideOffset={6} forceMount>
								{#snippet child({ wrapperProps, props, open })}
									{#if open}<div {...wrapperProps}><div {...props} class={tip} transition:fly={{ y: -4, duration: 120 }}>Zoom in (bits Tooltip → Zoom.In)</div></div>{/if}
								{/snippet}
							</Tooltip.Content>
						</Tooltip.Portal>
					</Tooltip.Root>

					<!-- 2. ours → yours: PageNav.Next's `child` renders our Button recipe. -->
					<PageNav.Prev>{#snippet child({ props })}<Button {...props} size="icon" icon="icon-[lucide--chevron-left]" />{/snippet}</PageNav.Prev>
					<PageNav.Input class="h-8 w-10 rounded-md border border-stone-300 bg-transparent text-center dark:border-stone-700" />
					<PageNav.Next>{#snippet child({ props })}<Button {...props} size="icon" icon="icon-[lucide--chevron-right]" />{/snippet}</PageNav.Next>
					<Separator />

					<!-- 3. Controlled bits Slider: the value comes from the viewer, changes call zoomTo (animated). -->
					<Slider.Root type="single" min={0.25} max={3} step={0.01} bind:value={() => viewer.zoom, (z) => Math.abs(z - viewer.zoom) > 0.011 && viewer.zoomTo(z)} aria-label="Zoom" class="relative flex h-5 w-32 touch-none items-center">
						<span class="relative h-1 w-full rounded-full bg-stone-200 dark:bg-stone-700"><Slider.Range class="absolute h-full rounded-full bg-stone-500" /></span>
						<Slider.Thumb index={0} class="block size-4 rounded-full border border-stone-300 bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
					</Slider.Root>
					<span class="w-10 text-xs text-stone-500 tabular-nums">{Math.round(viewer.zoom * 100)}%</span>
					<Separator />

					<!-- 4. Controlled bits Select bound to the viewer's bindable scrollMode. -->
					<Select.Root type="single" bind:value={scrollMode} items={modes}>
						<Select.Trigger class="inline-flex h-8 w-36 items-center justify-between rounded-md border border-stone-300 px-2 dark:border-stone-700" aria-label="Scroll mode">
							{modes.find((m) => m.value === scrollMode)?.label}<span class="icon-[lucide--chevrons-up-down] size-3.5 text-stone-400"></span>
						</Select.Trigger>
						<Select.Portal>
							<Select.Content sideOffset={4} forceMount>
								{#snippet child({ wrapperProps, props, open })}
									{#if open}
										<div {...wrapperProps}>
											<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-50 w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900">
												{#each modes as m (m.value)}
													<Select.Item value={m.value} label={m.label} class="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800">
														{#snippet children({ selected })}{m.label}{#if selected}<span class="icon-[lucide--check] size-4"></span>{/if}{/snippet}
													</Select.Item>
												{/each}
											</div>
										</div>
									{/if}
								{/snippet}
							</Select.Content>
						</Select.Portal>
					</Select.Root>

					<!-- 5. A bits Popover hosting our Toc.Tree (with an exit transition). -->
					<Popover.Root>
						<Popover.Trigger class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-300 px-2.5 dark:border-stone-700">
							<span class="icon-[lucide--list-tree] size-4"></span>Contents
						</Popover.Trigger>
						<Popover.Portal>
							<Popover.Content sideOffset={6} align="end" forceMount>
								{#snippet child({ wrapperProps, props, open })}
									{#if open}
										<div {...wrapperProps}>
											<div {...props} transition:fly={{ y: -6, duration: 140 }} class="z-50 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 text-sm shadow-xl dark:border-stone-700 dark:bg-stone-900">
												<Toc.Tree class="[--pdf-toc-indent:14px] [&_[data-pdf-toc-item]]:pl-2" />
											</div>
										</div>
									{/if}
								{/snippet}
							</Popover.Content>
						</Popover.Portal>
					</Popover.Root>
				</div>
				<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900">
					<Viewer.Pages />
				</Viewer.Viewport>
			</Paper.Root>
		{/snippet}
	</Viewer.Root>
</Document.Root>
