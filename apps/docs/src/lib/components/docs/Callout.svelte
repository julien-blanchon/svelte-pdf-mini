<script lang="ts">
	import type { Snippet } from 'svelte';

	let { type = 'note', title, children }: { type?: 'note' | 'tip' | 'warning'; title?: string; children?: Snippet } = $props();
	const icon = { note: 'icon-[lucide--info]', tip: 'icon-[lucide--lightbulb]', warning: 'icon-[lucide--triangle-alert]' };
</script>

<div class="card-outer my-6 rounded-lg bg-background-inset p-1.5" data-callout={type}>
	<div class="flex gap-3 rounded-md bg-background px-4 py-3 text-[15px] leading-relaxed text-foreground-muted card [&_code]:text-sm">
		<span class="mt-1 size-4 shrink-0 {icon[type]} {type === 'warning' ? 'text-warning' : 'text-accent'}"></span>
		<div class="min-w-0 [&>p]:mt-0">
			{#if title}<p class="mb-1 font-medium text-foreground">{title}</p>{/if}
			{@render children?.()}
		</div>
	</div>
</div>
