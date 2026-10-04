<!-- Shared by Annotations.Undo and Annotations.Redo. -->
<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { AnnotationsContext } from '../../state/context.js';
	import type { AnnotationsHistoryButtonProps } from './types.js';

	type Props = AnnotationsHistoryButtonProps & { action: 'undo' | 'redo' };

	let { action, ref = $bindable(null), child, children, ...rest }: Props = $props();
	const store = AnnotationsContext.get();
	const ICONS = { undo: '↶', redo: '↷' } as const;
	const disabled = $derived(action === 'undo' ? !store.canUndo : !store.canRedo);
	const label = $derived(store.viewer.t(action));
	const run = () => (action === 'undo' ? store.undo() : store.redo());
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			[`data-pdf-annotation-${action}`]: '',
			'aria-label': label,
			title: label,
			disabled,
			onclick: run,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, disabled })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ disabled })}{:else}{ICONS[action]}{/if}</button
	>
{/if}
