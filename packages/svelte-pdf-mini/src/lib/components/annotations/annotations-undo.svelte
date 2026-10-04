<script lang="ts">
	import HistoryButton from './history-button.svelte';
	import type { AnnotationsHistoryButtonProps } from './types.js';

	let { ref = $bindable(null), ...rest }: AnnotationsHistoryButtonProps = $props();
</script>

<HistoryButton action="undo" bind:ref {...rest} />
