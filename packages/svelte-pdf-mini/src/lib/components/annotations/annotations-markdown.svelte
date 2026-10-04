<!-- Renders a note's Markdown + LaTeX ($…$, $$…$$), sanitised (the same renderer the default UIs use). -->
<script lang="ts">
	import Markdown from '../../internal/Markdown.svelte';

	let { source }: { source: string } = $props();
</script>

<Markdown {source} />
