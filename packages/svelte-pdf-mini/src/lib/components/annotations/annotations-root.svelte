<script lang="ts">
	import { srOnlyStylesString } from 'svelte-toolbelt';
	import { defaultPalette } from '../../core/annotations/colors.js';
	import { AnnotationStore } from '../../state/annotations.svelte.js';
	import { AnnotationsContext, ViewerContext } from '../../state/context.js';
	import type { AnnotationsRootProps } from './types.js';

	let {
		annotations = $bindable([]),
		onAnnotationsChange,
		tool = $bindable('select'),
		onToolChange,
		color = $bindable('yellow'),
		onColorChange,
		palette = $bindable(defaultPalette),
		onPaletteChange,
		annotationsVisible,
		notesVisible,
		colorFilter,
		author,
		readonly,
		foreign,
		stickyTools,
		tools,
		selectOn,
		editOnCreate,
		inkSmoothing,
		keymap,
		importFromPdf,
		reanchor,
		onImport,
		store = $bindable(),
		children
	}: AnnotationsRootProps = $props();

	const annotationStore = AnnotationsContext.set(
		new AnnotationStore({
			viewer: ViewerContext.get(),
			annotations: () => annotations,
			setAnnotations: (list) => (annotations = list),
			onAnnotationsChange: (list, ops) => onAnnotationsChange?.(list, ops),
			tool: () => tool,
			onToolChange: (t) => {
				tool = t;
				onToolChange?.(t);
			},
			color: () => color,
			onColorChange: (c) => {
				color = c;
				onColorChange?.(c);
			},
			palette: () => palette,
			onPaletteChange: (p) => {
				palette = p;
				onPaletteChange?.(p);
			},
			author: () => author,
			readonly: () => readonly,
			foreign: () => foreign,
			stickyTools: () => stickyTools,
			tools: () => tools,
			selectOn: () => selectOn,
			editOnCreate: () => editOnCreate,
			inkSmoothing: () => inkSmoothing,
			keymap: () => keymap,
			importFromPdf: () => importFromPdf,
			reanchor: () => reanchor,
			onImport: (r) => onImport?.(r)
		})
	);
	store = annotationStore;
	// Optional props that drive the store's view state (also settable on the store directly).
	$effect(() => {
		if (annotationsVisible !== undefined) annotationStore.annotationsVisible = annotationsVisible;
	});
	$effect(() => {
		if (notesVisible !== undefined) annotationStore.notesVisible = notesVisible;
	});
	$effect(() => {
		if (colorFilter !== undefined) annotationStore.colorFilter = colorFilter;
	});
</script>

<!-- Screen-reader announcements (created, deleted, overlapping…). -->
<div role="status" aria-live="polite" data-pdf-annotation-announcer="" style={srOnlyStylesString}>
	{annotationStore.announcement}
</div>
{@render children?.({ store: annotationStore })}
