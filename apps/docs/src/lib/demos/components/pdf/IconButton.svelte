<!-- A small styled button used by the app examples (works as a `child` snippet target too). -->
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let { icon, children, class: className = '', ...rest }: HTMLButtonAttributes & { icon?: string } = $props();
</script>

<button
	type="button"
	class="grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm text-stone-700 transition-colors hover:bg-stone-200/70 disabled:opacity-35 data-[active]:bg-stone-800 data-[active]:text-white dark:text-stone-300 dark:hover:bg-stone-700/60 dark:data-[active]:bg-stone-200 dark:data-[active]:text-stone-900 {className}"
	{...rest}
>
	{#if icon}<span class="{icon} size-4"></span>{/if}
	{@render children?.()}
</button>
