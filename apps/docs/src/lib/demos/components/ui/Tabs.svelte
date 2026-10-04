<!-- Tabs recipe (bits-ui Tabs): pass `tabs` and a `content` snippet. -->
<script lang="ts" generics="T extends string">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { cn } from './cn.ts';

	let { value = $bindable(), tabs, content, class: className, listClass }: { value: T; tabs: { value: T; label: string; icon?: string }[]; content: Snippet<[T]>; class?: string; listClass?: string } = $props();
</script>

<Tabs.Root bind:value={() => value, (v) => (value = v as T)} class={cn('flex min-h-0 flex-col', className)}>
	<Tabs.List class={cn('flex flex-wrap gap-0.5 rounded-lg bg-stone-200/60 p-0.5 dark:bg-stone-800', listClass)}>
		{#each tabs as t (t.value)}
			<Tabs.Trigger value={t.value} title={t.label} class="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-stone-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm dark:text-stone-400 dark:data-[state=active]:bg-stone-600 dark:data-[state=active]:text-white">
				{#if t.icon}<span class={cn(t.icon, 'size-3.5')}></span>{/if}<span>{t.label}</span>
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
	{#each tabs as t (t.value)}
		<Tabs.Content value={t.value} class="flex min-h-0 flex-1 flex-col outline-none">{@render content(t.value)}</Tabs.Content>
	{/each}
</Tabs.Root>
