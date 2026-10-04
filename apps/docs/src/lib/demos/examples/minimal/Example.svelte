<script module lang="ts">
	export const meta = {
		title: 'Minimal',
		description: 'The smallest useful viewer: a document, a scroll viewport and the default pages.',
		order: 0,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { Document, Viewer } from 'svelte-pdf-mini';
</script>

<Document.Root src="https://arxiv.org/pdf/1706.03762">
	<Viewer.Root class="h-full">
		<Viewer.Viewport class="h-full bg-neutral-100 dark:bg-neutral-900">
			<Viewer.Pages />
		</Viewer.Viewport>
	</Viewer.Root>
</Document.Root>
