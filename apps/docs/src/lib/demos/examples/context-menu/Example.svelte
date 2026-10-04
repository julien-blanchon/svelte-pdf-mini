<script module lang="ts">
	export const meta = {
		title: 'Context menu & shortcuts',
		description: 'Right-click (or Menu key / Shift+F10) on selected text, an annotation, a citation, a figure, a link or the page. The menu is built from viewer.lastContext + contextActions() and rendered with bits-ui; every entry shows its keyboard shortcut. Press ? for the full list.',
		order: 13.5,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, Paper, Viewer, type Annotation } from 'svelte-pdf-mini';
	import PdfContextMenu from '#lib/demos/components/pdf/PdfContextMenu.svelte';
	import ShortcutsDialog from '#lib/demos/components/pdf/ShortcutsDialog.svelte';
	import Kbd from '#lib/demos/components/ui/Kbd.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let annotations = $state<Annotation[]>([]);
	let help = $state(false);
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="flex h-full flex-col">
		<Paper.Root>
			<Annotations.Root bind:annotations author={{ name: 'You' }}>
				<div class="flex items-center gap-3 border-b border-stone-200 px-3 py-2 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-300">
					<span class="icon-[lucide--mouse-pointer-click] size-4"></span>
					Right-click anything in the paper.
					<button class="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-800" onclick={() => (help = true)}>
						Shortcuts <Kbd>?</Kbd>
					</button>
				</div>
				<PdfContextMenu onOpenReference={(r) => window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(r.parsed.title ?? r.raw)}`, '_blank', 'noopener')}>
					{#snippet trigger({ props })}
						<Viewer.Viewport {...props} class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900">
							<Viewer.Pages>
								{#snippet children({ pageNumber })}
									<Viewer.Page {pageNumber}>
										<Viewer.Canvas />
										<Viewer.TextLayer />
										<Viewer.LinkLayer />
										<Paper.Layer />
										<Annotations.Layer />
										<Viewer.Focus />
									</Viewer.Page>
								{/snippet}
							</Viewer.Pages>
						</Viewer.Viewport>
					{/snippet}
				</PdfContextMenu>
				<Annotations.Popover />
				<Annotations.SelectionMenu />
				<ShortcutsDialog bind:open={help} />
			</Annotations.Root>
		</Paper.Root>
	</Viewer.Root>
</Document.Root>
