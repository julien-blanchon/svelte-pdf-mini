<!--
	Button recipe. Also a good `child` target: <Zoom.In>{#snippet child({ props })}<Button {...props} />{/snippet}</Zoom.In>
-->
<script lang="ts" module>
	export type ButtonVariant = 'ghost' | 'outline' | 'solid' | 'subtle';
	export type ButtonSize = 'sm' | 'md' | 'icon';
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from './cn.ts';

	let {
		variant = 'ghost',
		size = 'md',
		icon,
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: HTMLButtonAttributes & { variant?: ButtonVariant; size?: ButtonSize; icon?: string; ref?: HTMLButtonElement | null } = $props();

	const variants: Record<ButtonVariant, string> = {
		ghost: 'hover:bg-stone-200/70 dark:hover:bg-stone-700/60',
		outline: 'border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800',
		solid: 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white',
		subtle: 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700'
	};
	const sizes: Record<ButtonSize, string> = { sm: 'h-7 px-2 text-xs gap-1', md: 'h-8 px-2.5 text-sm gap-1.5', icon: 'h-8 w-8 text-sm' };
</script>

<button
	bind:this={ref}
	type="button"
	class={cn(
		'inline-flex shrink-0 items-center justify-center rounded-md text-stone-700 transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:pointer-events-none disabled:opacity-35 data-[active]:bg-stone-900 data-[active]:text-white aria-pressed:bg-stone-900 aria-pressed:text-white dark:text-stone-300 dark:data-[active]:bg-stone-100 dark:data-[active]:text-stone-900 dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900',
		variants[variant],
		sizes[size],
		className
	)}
	{...rest}
>
	{#if icon}<span class={cn(icon, 'size-4')}></span>{/if}
	{@render children?.()}
</button>
