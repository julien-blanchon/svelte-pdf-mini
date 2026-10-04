<script module lang="ts">
	export const meta = {
		title: 'Export & re-import (PDF)',
		description: 'Annotate, export a real PDF with standard annotations (open it in Preview, Acrobat or Chrome), then drop it back here: everything comes back exactly, including colours, labels and notes. Also Markdown and JSON export.',
		order: 13,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Annotations, Document, Viewer, type Annotation, type AnnotationStore, type PdfSource } from 'svelte-pdf-mini';
	import AnnotationToolbar from '#lib/demos/components/pdf/AnnotationToolbar.svelte';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let src = $state<PdfSource>(defaultPaper);
	let annotations = $state<Annotation[]>([]);
	let store = $state<AnnotationStore>();
	let status = $state('Annotate the paper, then export.');
	let markdown = $state('');

	function download(bytes: Uint8Array | string, name: string, type: string) {
		const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
		const a = Object.assign(document.createElement('a'), { href: url, download: name });
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	async function exportPdf() {
		const bytes = await store!.exportPdf();
		download(bytes, 'annotated.pdf', 'application/pdf');
		status = `Exported ${annotations.length} annotations (${(bytes.length / 1024).toFixed(0)} KB). Drop the file here to re-import.`;
	}
	async function reimport() {
		// Load the exported bytes as the document: Annotations.Root importFromPdf reads them back.
		src = await store!.exportPdf();
		status = 'Re-opened the exported PDF: annotations below were read from the file.';
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		const f = e.dataTransfer?.files[0];
		if (f) {
			src = f;
			status = `Opened ${f.name}`;
		}
	}
	const btn = 'rounded-md border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';
</script>

<div class="flex h-full flex-col" role="region" aria-label="Drop a PDF" ondragover={(e) => e.preventDefault()} ondrop={onDrop}>
	<Document.Root {src}>
		<Viewer.Root zoomMode="page-width" class="flex min-h-0 flex-1 flex-col">
			<Annotations.Root bind:annotations bind:store importFromPdf author={{ name: 'You' }} onImport={(r) => (status = `Read ${r.annotations.length} annotations from the file (${r.foreign} foreign, ${r.unsupported} unsupported).`)}>
				<div class="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
					<AnnotationToolbar />
					<span class="mx-1 h-5 w-px bg-neutral-300"></span>
					<button class={btn} onclick={exportPdf}>Export PDF</button>
					<button class={btn} onclick={reimport}>Re-open exported</button>
					<button class={btn} onclick={() => (markdown = store!.toMarkdown({ title: 'Notes' }))}>Markdown</button>
					<button class={btn} onclick={() => download(JSON.stringify(store!.toJSON(), null, 2), 'annotations.json', 'application/json')}>JSON</button>
				</div>
				<p class="border-b border-neutral-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900 dark:border-neutral-800 dark:bg-blue-950 dark:text-blue-100">{status}</p>
				<div class="flex min-h-0 flex-1">
					<Viewer.Viewport class="min-w-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
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
					{#if markdown}
						<pre class="w-96 shrink-0 overflow-auto border-l border-neutral-200 p-3 text-xs whitespace-pre-wrap dark:border-neutral-800">{markdown}</pre>
					{/if}
				</div>
				<Annotations.SelectionMenu />
				<Annotations.Popover />
			</Annotations.Root>
		</Viewer.Root>
	</Document.Root>
</div>
