<!-- Keyboard hints for the annotation workflow (normal mode = select). -->
<script lang="ts">
	import { AnnotationsContext, comboLabel } from 'svelte-pdf-mini';
	import Kbd from '../ui/Kbd.svelte';

	let { compact = false }: { compact?: boolean } = $props();
	const store = AnnotationsContext.get();
	const k = (a: Parameters<typeof comboLabel>[1]) => comboLabel(store.keymap, a);
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
	{#if store.pendingId}
		<span class="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400"><Kbd>↵</Kbd> keep <Kbd>Esc</Kbd> / <Kbd>⌫</Kbd> discard <Kbd>1–9</Kbd> colour (before typing)</span>
	{:else if !store.viewer.selection.isEmpty}
		<span class="flex items-center gap-1"><Kbd>{k('markup.highlight')}</Kbd> highlight <Kbd>{k('markup.underline')}</Kbd> underline <Kbd>{k('markup.strikeout')}</Kbd> strike <Kbd>{k('markup.comment')}</Kbd> comment <Kbd>1–9</Kbd> colour</span>
	{:else if store.selectedIds.length}
		<span class="flex items-center gap-1"><Kbd>{k('edit')}</Kbd> edit note <Kbd>Del</Kbd> delete <Kbd>Alt</Kbd>+click next overlap <Kbd>1–9</Kbd> colour <Kbd>←↑→↓</Kbd> nudge <Kbd>Esc</Kbd> deselect</span>
	{:else}
		<span class="flex items-center gap-1">Select text to annotate · click an annotation to select it (click again to cycle overlaps){#if !compact}<span class="ml-1">· tools</span> <Kbd>{k('tool.area')}</Kbd> box <Kbd>{k('tool.ink')}</Kbd> pen <Kbd>{k('tool.note')}</Kbd> note <Kbd>{k('tool.select')}</Kbd> select{/if}</span>
	{/if}
</div>
