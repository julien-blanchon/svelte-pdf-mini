<script module lang="ts">
	export const meta = {
		title: 'Highlights & side notes',
		description: 'Normal mode is selection: select text and press H / U / S / C, a colour 1–9, or use the floating menu. The new annotation opens its note (Enter keeps; Esc — or Backspace before typing — discards; 1–9 recolour). Click an annotation to select it (click again to cycle overlaps), Delete removes it. Notes support Markdown and $\\LaTeX$; they sit in the margin, the gutter has one thin bar per annotation (in lanes when they overlap), and filters show only some colours.',
		order: 10,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, Viewer, defaultPalette, type Annotation, type AnnotationStore } from 'svelte-pdf-mini';
	import AnnotationColorPicker from '#lib/demos/components/pdf/AnnotationColorPicker.svelte';
	import AnnotationFilters from '#lib/demos/components/pdf/AnnotationFilters.svelte';
	import AnnotationToolbar from '#lib/demos/components/pdf/AnnotationToolbar.svelte';
	import NoteHoverCard from '#lib/demos/components/pdf/NoteHoverCard.svelte';
	import WorkflowHints from '#lib/demos/components/pdf/WorkflowHints.svelte';
	import Separator from '#lib/demos/components/ui/Separator.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let annotations = $state<Annotation[]>([]);
	let store = $state<AnnotationStore>();
	let palette = $state(defaultPalette);
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoom={1} zoomMode="manual" class="flex h-full flex-col">
		<Annotations.Root bind:annotations bind:store bind:palette author={{ name: 'You' }}>
			<div class="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-1.5 dark:border-stone-800">
				<AnnotationToolbar tools={['select', 'highlight', 'underline', 'strikeout', 'squiggly']} colors={false} />
				<Separator />
				<AnnotationColorPicker />
				<Separator />
				<AnnotationFilters />
				<span class="ml-auto text-xs text-stone-500">{annotations.length} annotation{annotations.length === 1 ? '' : 's'}</span>
			</div>
			<div class="border-b border-stone-200 bg-stone-50 px-3 py-1 dark:border-stone-800 dark:bg-stone-900"><WorkflowHints /></div>
			<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900 {store?.notesVisible === false ? '' : '[--pdf-pages-aside:282px]'}">
				<Viewer.Pages>
					{#snippet children({ pageNumber })}
						<!-- Room on the right for the side notes. -->
						<Viewer.Page {pageNumber}>
							<Viewer.Canvas />
							<Viewer.TextLayer />
							<Annotations.Layer />
							<Annotations.LineMarkers markers="all" />
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
