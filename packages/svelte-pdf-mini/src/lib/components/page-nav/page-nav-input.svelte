<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { FocusEventHandler, KeyboardEventHandler } from 'svelte/elements';
	import { ViewerContext } from '../../state/context.js';
	import type { PageNavInputProps } from './types.js';

	let { ref = $bindable(null), child, children: _children, ...rest }: PageNavInputProps = $props();
	const viewer = ViewerContext.get();
	const refAttachment = attachRef<HTMLInputElement>((node) => (ref = node));
	const numPages = $derived(viewer.document.numPages);

	/** Shows the current page again (after a commit, or to drop an edit). */
	const reset = (input: HTMLInputElement) => (input.value = String(viewer.page));

	/** Goes to the typed page when it is a number ≥ 1, then shows the page reached. */
	function commit(input: HTMLInputElement) {
		const n = Number(input.value);
		if (Number.isFinite(n) && n >= 1) viewer.goToPage(n);
		reset(input);
	}

	const onkeydown: KeyboardEventHandler<HTMLInputElement> = (e) => {
		if (e.key === 'Enter') commit(e.currentTarget);
		else if (e.key === 'Escape') reset(e.currentTarget);
	};
	const onblur: FocusEventHandler<HTMLInputElement> = (e) => commit(e.currentTarget);
	const onfocus: FocusEventHandler<HTMLInputElement> = (e) => e.currentTarget.select();

	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'text',
			inputmode: 'numeric' as const,
			'data-pdf-page-input': '',
			'aria-label': viewer.t('pageInput', { count: numPages }),
			value: String(viewer.page),
			size: Math.max(2, String(numPages).length),
			onkeydown,
			onblur,
			onfocus,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, page: viewer.page, numPages })}
{:else}
	<input {...mergedProps} />
{/if}
