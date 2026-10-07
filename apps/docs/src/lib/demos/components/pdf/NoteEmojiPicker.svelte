<!--
	Note emoji recipe: while the note tool is active (or notes are selected) the
	store's `pickingNoteEmoji` is true and keys 1–8 pick an emoji: show the emoji
	(Annotations.NoteEmoji) in place of the color picker then.
-->
<script lang="ts">
	import { Annotations, AnnotationsContext } from 'svelte-pdf-mini';
	import Tip from '../ui/Tip.svelte';
	import AnnotationColorPicker from './AnnotationColorPicker.svelte';

	const store = AnnotationsContext.get();
</script>

{#if store.pickingNoteEmoji}
	<div class="flex items-center gap-0.5" role="group" aria-label="Note emoji">
		{#each store.noteEmojis.slice(0, 8) as emoji, i (emoji)}
			<Tip label="Note emoji" shortcut={String(i + 1)}>
				{#snippet child({ props })}
					<Annotations.NoteEmoji {emoji} {...props} class="grid size-7 place-items-center rounded-md text-base outline-none hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[active]:bg-stone-200 data-[active]:ring-[1.5px] data-[active]:ring-stone-800 dark:hover:bg-stone-700/60 dark:data-[active]:bg-stone-700 dark:data-[active]:ring-stone-100" />
				{/snippet}
			</Tip>
		{/each}
	</div>
{:else}
	<AnnotationColorPicker />
{/if}
