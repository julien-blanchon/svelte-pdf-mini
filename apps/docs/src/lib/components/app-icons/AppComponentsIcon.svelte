<script lang="ts">
	import AppIconify from './AppIconify.svelte';
	let { size, class: className }: { size?: number; class?: string } = $props();
</script>

<AppIconify icon="icon-[lucide--blocks]" {size} class={className} />
