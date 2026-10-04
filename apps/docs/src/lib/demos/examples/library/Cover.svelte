<!--
	First page of a PDF as a static cover: fitted to the width and cropped to the top of
	the page by the fixed-aspect box around it, so every cover has the same size.
	pageFrame="none": the card provides the frame, the page doesn't draw its own.
-->
<script lang="ts">
	import { Document, Viewer, type PageThemeStrategy } from 'svelte-pdf-mini';

	let { src, theme }: { src: string; theme: PageThemeStrategy } = $props();
</script>

<Document.Root {src}>
	<Viewer.Root scrollMode="page" zoomMode="page-width" pageTheme={theme} pageFrame="none" smoothZoom={false} wheelZoom={false} keyboard={false} overscan={0} class="h-full">
		<Viewer.Viewport tabindex={-1} class="h-full overflow-hidden! [--pdf-pages-padding:0]">
			<Viewer.Pages>
				{#snippet children({ pageNumber })}
					<Viewer.Page {pageNumber}><Viewer.Canvas /></Viewer.Page>
				{/snippet}
			</Viewer.Pages>
		</Viewer.Viewport>
	</Viewer.Root>
</Document.Root>
