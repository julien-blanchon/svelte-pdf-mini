<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { FormEventHandler, KeyboardEventHandler } from 'svelte/elements';
	import { FindContext } from '../../state/context.js';
	import type { FindInputProps } from './types.js';

	let {
		captureShortcut = true,
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: FindInputProps = $props();
	const find = FindContext.get();
	const refAttachment = attachRef<HTMLInputElement>((node) => (ref = node));

	const isFindShortcut = (e: KeyboardEvent) =>
		(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f';

	/** Focus or pointer is in this find's viewer (so Ctrl/⌘ + F is meant for it). */
	function viewerHasAttention(): boolean {
		const scrollEl = find.viewer.scrollEl;
		const root = scrollEl?.closest('[data-pdf-viewer]') ?? scrollEl;
		return !!root && (root.contains(document.activeElement) || root.matches(':hover'));
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (!captureShortcut || !ref || !isFindShortcut(e) || !viewerHasAttention()) return;
		e.preventDefault();
		// Seed the query with the selected text, like browsers do.
		const selected = find.viewer.selection.text.trim();
		if (selected && selected.length < 120) find.query = selected;
		ref.focus();
		ref.select();
	}

	const oninput: FormEventHandler<HTMLInputElement> = (e) => (find.query = e.currentTarget.value);

	const onkeydown: KeyboardEventHandler<HTMLInputElement> = (e) => {
		// Enter / ↓: next match; Shift+Enter / ↑: previous.
		if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) find.prev();
			else find.next();
		} else if (e.key === 'Escape') {
			find.clear();
			find.viewer.scrollEl?.focus();
		}
	};

	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'search',
			'data-pdf-find-input': '',
			'aria-label': find.viewer.t('find'),
			autocomplete: 'off',
			spellcheck: false,
			value: find.query,
			oninput,
			onkeydown,
			...refAttachment
		})
	);
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<input {...mergedProps} />
{/if}
