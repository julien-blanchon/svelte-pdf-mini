<script module lang="ts">
	export const meta = {
		title: 'Stress test',
		description: 'GPT-3 (75 pages): only pages near the view are rendered; scroll fast or zoom to watch the scheduler cancel and re-prioritise work.',
		order: 190,
		kind: 'app'
	} as const;
</script>

<script lang="ts">
	import { Document, Viewer, type ViewerState } from 'svelte-pdf-mini';
	import { arxivPdf } from '#lib/demos/papers.ts';

	let viewer = $state<ViewerState>();
	let fps = $state(0);
	$effect(() => {
		let frames = 0;
		let last = performance.now();
		let raf = requestAnimationFrame(function loop(t) {
			frames++;
			if (t - last >= 1000) {
				fps = frames;
				frames = 0;
				last = t;
			}
			raf = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(raf);
	});
	const rendered = $derived(viewer ? viewer.nearPages.size : 0);
</script>

<Document.Root src={arxivPdf('2005.14165')}>
	<Viewer.Root bind:viewer zoomMode="page-width" class="relative h-full">
		<Viewer.Viewport class="h-full bg-neutral-100 dark:bg-neutral-900">
			<Viewer.Pages />
		</Viewer.Viewport>
		<div class="pointer-events-none absolute top-3 right-6 rounded bg-black/70 px-3 py-2 font-mono text-xs text-white">
			<div>{fps} fps</div>
			<div>page {viewer?.page ?? '-'} / {viewer?.document.numPages ?? '-'}</div>
			<div>rendered pages: {rendered}</div>
			<div>zoom {Math.round((viewer?.zoom ?? 1) * 100)}%</div>
		</div>
	</Viewer.Root>
</Document.Root>
