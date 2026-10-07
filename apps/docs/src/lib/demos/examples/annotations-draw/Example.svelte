<script module lang="ts">
	export const meta = {
		title: 'Boxes, drawing & notes',
		description: 'Pick a tool (A box, P pen, L arrow, R rectangle, N note, then 1–8 picks its emoji, T text): after one creation you are back in select mode with the new annotation’s note open (Enter keeps; Esc, or Backspace before typing, discards; 1–9 recolour). Click a shape to select it: drag to move, drag any corner or edge to resize (Shift keeps proportions, Alt resizes from the centre), arrows nudge, Delete removes. Overlapping shapes: the innermost wins, click again (or Alt+click) to reach the one below. The pen draws pressure-sensitive strokes (perfect-freehand); text boxes are typed right on the page.',
		order: 11,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, Viewer, defaultNoteEmojis, defaultPalette, type Annotation } from 'svelte-pdf-mini';
	import AnnotationToolbar from '#lib/demos/components/pdf/AnnotationToolbar.svelte';
	import NoteEmojiPicker from '#lib/demos/components/pdf/NoteEmojiPicker.svelte';
	import NoteHoverCard from '#lib/demos/components/pdf/NoteHoverCard.svelte';
	import WorkflowHints from '#lib/demos/components/pdf/WorkflowHints.svelte';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let annotations = $state<Annotation[]>([]);
	let palette = $state(defaultPalette);
	let stickyTools = $state(false);
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoom={1} zoomMode="manual" page={3} class="flex h-full flex-col">
		<Annotations.Root bind:annotations bind:palette noteEmojis={defaultNoteEmojis} {stickyTools} color="blue" author={{ name: 'You' }}>
			<div class="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-1.5 dark:border-stone-800">
				<AnnotationToolbar colors={false} />
				<Separator />
				<NoteEmojiPicker />
				<label class="ml-auto flex items-center gap-1.5 text-xs text-stone-500"><input type="checkbox" bind:checked={stickyTools} /> keep tool after drawing</label>
			</div>
			<div class="border-b border-stone-200 bg-stone-50 px-3 py-1 dark:border-stone-800 dark:bg-stone-900"><WorkflowHints /></div>
			<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900 [--pdf-pages-aside:282px]">
				<Viewer.Pages>
					{#snippet children({ pageNumber })}
						<Viewer.Page {pageNumber}>
							<Viewer.Canvas />
							<Viewer.TextLayer />
							<Annotations.Layer />
							<Annotations.Margin class="[--pdf-margin-width:250px]" />
						</Viewer.Page>
					{/snippet}
				</Viewer.Pages>
			</Viewer.Viewport>
			<Annotations.SelectionMenu />
			<Annotations.Popover />
			<NoteHoverCard />
		</Annotations.Root>
	</Viewer.Root>
</Document.Root>
