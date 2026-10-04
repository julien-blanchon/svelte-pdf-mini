<script lang="ts">
	import { Annotations, Document, Paper, Toc, Viewer, type Annotation, type PaperState, type ViewerState } from 'svelte-pdf-mini';

	let {
		src,
		label,
		annotations = $bindable([]),
		viewer = $bindable(),
		paper = $bindable(),
		onInteract
	}: {
		src: string;
		label: string;
		annotations?: Annotation[];
		viewer?: ViewerState;
		paper?: PaperState;
		onInteract?: () => void;
	} = $props();
</script>

<div class="flex min-w-0 flex-1 flex-col" role="region" aria-label={label} onpointerenter={onInteract} onwheel={onInteract} onpointerdown={onInteract}>
	<Document.Root {src}>
		<Viewer.Root bind:viewer zoomMode="page-width" class="flex min-h-0 flex-1 flex-col">
			<Paper.Root bind:paper>
				<Annotations.Root bind:annotations author={{ name: 'You' }}>
					<header class="flex items-center gap-2 border-b border-stone-200 px-3 py-1.5 text-sm dark:border-stone-800">
						<span class="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-white">{label}</span>
						<Toc.Breadcrumb class="min-w-0 flex-1 truncate text-stone-500" />
						<span class="text-xs text-stone-500 tabular-nums">p. {viewer?.page ?? '–'}/{viewer?.document.numPages ?? '–'}</span>
					</header>
					<Viewer.Viewport class="min-h-0 flex-1 bg-stone-200/60 dark:bg-stone-900">
						<Viewer.Pages>
							{#snippet children({ pageNumber })}
								<Viewer.Page {pageNumber}>
									<Viewer.Canvas />
									<Viewer.TextLayer />
									<Annotations.Layer />
								</Viewer.Page>
							{/snippet}
						</Viewer.Pages>
					</Viewer.Viewport>
					<Annotations.SelectionMenu />
					<Annotations.Popover />
					<Annotations.HoverCard />
				</Annotations.Root>
			</Paper.Root>
		</Viewer.Root>
	</Document.Root>
</div>
