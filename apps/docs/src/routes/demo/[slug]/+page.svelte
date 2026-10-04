<!-- A demo on its own, full screen (the "Open" link of each demo, and the e2e target). -->
<script lang="ts">
	import { Tooltip } from 'bits-ui';

	let { data } = $props();
</script>

<svelte:head><title>{data.title} · svelte-pdf-mini</title></svelte:head>

<div class="h-dvh bg-background text-foreground" data-demo={data.slug}>
	<Tooltip.Provider delayDuration={300}><data.component /></Tooltip.Provider>
</div>
