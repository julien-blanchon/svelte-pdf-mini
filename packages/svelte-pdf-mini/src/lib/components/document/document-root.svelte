<script lang="ts">
	import { DocumentContext } from '../../state/context.js';
	import { PdfDocument } from '../../state/document.svelte.js';
	import type { DocumentRootProps } from './types.js';

	let {
		src,
		password,
		documentOptions,
		document = $bindable(),
		onLoad,
		onError,
		children
	}: DocumentRootProps = $props();

	const doc = DocumentContext.set(
		new PdfDocument({
			src: () => src,
			password: () => password,
			documentOptions: () => documentOptions,
			onLoad: (d) => onLoad?.(d),
			onError: (e) => onError?.(e)
		})
	);
	document = doc;
</script>

{@render children?.({
	document: doc,
	status: doc.status,
	numPages: doc.numPages,
	progress: doc.progress,
	error: doc.error
})}
