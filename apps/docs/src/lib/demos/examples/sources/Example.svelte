<script module lang="ts">
	export const meta = {
		title: 'Sources & states',
		description: 'Load from a URL, a local file or drag-and-drop; loading, error and password states.',
		order: 1,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Viewer, type PdfSource } from 'svelte-pdf-mini';
	import { arxivPdf, papers } from '#lib/demos/papers.ts';

	let src = $state<PdfSource | null>(arxivPdf(papers[0].id));
	let label = $state(papers[0].title);
	let dragging = $state(false);

	function openFile(file: File | undefined) {
		if (!file) return;
		src = file;
		label = file.name;
	}
</script>

<div
	class="flex h-full flex-col"
	role="region"
	aria-label="Drop a PDF"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={(e) => {
		e.preventDefault();
		dragging = false;
		openFile(e.dataTransfer?.files[0]);
	}}
>
	<div class="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-2 text-sm dark:border-neutral-800">
		{#each papers.slice(0, 4) as p (p.id)}
			<button class="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" onclick={() => ((src = arxivPdf(p.id)), (label = p.title))}>{p.id}</button>
		{/each}
		<button class="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700" onclick={() => ((src = 'https://arxiv.org/pdf/0000.00000'), (label = 'Broken URL'))}>Broken URL</button>
		<label class="cursor-pointer rounded bg-neutral-900 px-2 py-1 text-white dark:bg-white dark:text-black">
			Open file…
			<input type="file" accept="application/pdf" class="hidden" onchange={(e) => openFile(e.currentTarget.files?.[0])} />
		</label>
		<span class="ml-auto truncate text-neutral-500">{label}</span>
	</div>

	<Document.Root {src}>
		{#snippet children({ status, numPages })}
			<div class="relative min-h-0 flex-1">
				<Document.Loading class="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-neutral-200">
					{#snippet children({ progress })}
						<div class="h-full bg-blue-600 transition-[width]" style:width="{Number.isFinite(progress) ? progress * 100 : 30}%"></div>
					{/snippet}
				</Document.Loading>
				<Document.Error class="m-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
					{#snippet children({ error })}
						<strong>Could not open this PDF</strong> ({error.kind}): {error.message}
					{/snippet}
				</Document.Error>
				<Document.Password class="m-6 flex flex-col gap-2 rounded border p-4 text-sm [&_input]:rounded [&_input]:border [&_input]:px-2 [&_input]:py-1 [&_label]:flex [&_label]:flex-col [&_label]:gap-1" />
				<Viewer.Root class="h-full">
					<Viewer.Viewport class="h-full bg-neutral-100 dark:bg-neutral-900">
						<Viewer.Pages />
					</Viewer.Viewport>
				</Viewer.Root>
				{#if dragging}
					<div class="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-500/10 text-blue-700">Drop the PDF to open it</div>
				{/if}
				<p class="absolute right-3 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{status}{numPages ? ` · ${numPages} pages` : ''}</p>
			</div>
		{/snippet}
	</Document.Root>
</div>
