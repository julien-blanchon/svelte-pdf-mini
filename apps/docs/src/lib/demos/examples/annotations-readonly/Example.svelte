<script module lang="ts">
	export const meta = {
		title: 'Read-only & foreign annotations',
		description: 'The same annotations shown editable, read-only, or with only foreign ones locked. "Foreign" means they came from someone else’s PDF; ours are always editable unless readonly is set.',
		order: 12,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, Viewer, defaultPalette, type Annotation, type ForeignPolicy } from 'svelte-pdf-mini';
	import { defaultPaper } from '#lib/demos/papers.ts';

	const now = new Date().toISOString();
	const yellow = defaultPalette[0];
	const green = defaultPalette[1];
	// Two annotations: one of ours, one "foreign" (e.g. imported from a colleague's PDF).
	let annotations = $state<Annotation[]>([
		{ id: 'ours', page: 1, kind: 'area', rect: [130, 480, 485, 545], color: yellow.rgb, paletteKey: 'yellow', opacity: 1, label: 'Ours', contents: 'Created in this app: editable.', createdAt: now, modifiedAt: now, origin: 'local', author: { name: 'You' } },
		{ id: 'theirs', page: 1, kind: 'area', rect: [130, 400, 485, 470], color: green.rgb, paletteKey: 'green', opacity: 1, label: 'Foreign', contents: 'Imported from another PDF.', createdAt: now, modifiedAt: now, origin: 'foreign', author: { name: 'A colleague' } }
	]);
	let readonly = $state(false);
	let foreign = $state<ForeignPolicy>('readonly');
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="flex h-full flex-col">
		<Annotations.Root bind:annotations {readonly} {foreign}>
			<div class="flex flex-wrap items-center gap-4 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
				<label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={readonly} /> readonly (everything)</label>
				<label class="flex items-center gap-1.5">foreign:
					<select bind:value={foreign} class="rounded border border-neutral-300 bg-transparent px-1 dark:border-neutral-700">
						<option value="editable">editable</option><option value="readonly">readonly</option><option value="hidden">hidden</option>
					</select>
				</label>
				<span class="text-neutral-500">Click a box: editable ones show handles and a colour bar.</span>
			</div>
			<Viewer.Viewport class="min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900 [--pdf-pages-aside:282px]">
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
			<Annotations.Popover />
		</Annotations.Root>
	</Viewer.Root>
</Document.Root>
