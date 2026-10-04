<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { TextMarkupKind } from '../../core/annotations/model.js';
	import { on } from 'svelte/events';
	import { float, virtualRef } from '../../internal/floating.js';
	import { handleRovingKey } from '../../internal/roving.js';
	import Icon from '../../internal/Icon.svelte';
	import type { IconName } from '../../internal/icons.js';
	import { AnnotationsContext } from '../../state/context.js';
	import type { AnnotationsSelectionMenuProps } from './types.js';

	let {
		forceMount = false,
		onOpenChange,
		placement = 'top',
		ref = $bindable(null),
		child,
		children,
		...rest
	}: AnnotationsSelectionMenuProps = $props();
	const store = AnnotationsContext.get();
	const sel = store.viewer.selection;
	let el: HTMLElement | null = $state(null);
	/** Closed by the user (Esc, copy, context menu) until the selection changes. */
	let dismissed = $derived.by(() => {
		void sel.text;
		return false;
	});

	const open = $derived(
		!store.readonly &&
			store.tool === 'select' &&
			!sel.selecting &&
			!sel.isEmpty &&
			!!sel.anchorRect &&
			!dismissed
	);
	$effect(() => onOpenChange?.(open));
	// A context menu replaces the selection toolbar.
	$effect(() => {
		const scrollEl = store.viewer.scrollEl;
		if (!scrollEl) return;
		return on(scrollEl, 'contextmenu', () => (dismissed = true));
	});
	$effect(() => {
		const floating = el;
		const rect = sel.anchorRect;
		if (!open || !floating || !rect) return;
		return float(
			virtualRef(() => rect, store.viewer.scrollEl ?? undefined),
			floating,
			placement
		);
	});

	const markup = (kind: TextMarkupKind = 'highlight', color?: string) => {
		if (color) store.color = color;
		return store.createFromSelection(kind);
	};
	const comment = () => {
		const [a] = store.createFromSelection('highlight');
		if (a) store.editingId = a.id;
	};
	const copy = () => {
		navigator.clipboard?.writeText(sel.text);
		dismissed = true;
	};
	const close = () => (dismissed = true);
	/** Default content: the markup actions after the colour swatches. */
	const actions = $derived(
		(
			[
				{
					part: 'underline',
					icon: 'underline',
					label: store.viewer.t('underline'),
					key: 'U',
					run: () => markup('underline')
				},
				{
					part: 'strikeout',
					icon: 'strikeout',
					label: store.viewer.t('strikeout'),
					key: 'S',
					run: () => markup('strikeout')
				},
				{
					part: 'comment',
					icon: 'comment',
					label: store.viewer.t('comment'),
					key: 'C',
					run: comment
				},
				{ part: 'copy', icon: 'copy', label: store.viewer.t('copy'), key: undefined, run: copy }
			] satisfies { part: string; icon: IconName; label: string; key?: string; run: () => void }[]
		).filter((a) =>
			a.part === 'underline' || a.part === 'strikeout' ? store.allows(a.part) : true
		)
	);

	// Toolbar pattern: arrows move between the enabled buttons (also in custom content), Esc closes.
	function onKeydown(e: KeyboardEvent) {
		const items = [...(el?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
		const i = items.findIndex((item) => item === document.activeElement);
		const moved = handleRovingKey(e, i, items.length, {
			orientation: 'horizontal',
			focus: (next) => items[next].focus()
		});
		if (moved || e.key !== 'Escape') return;
		e.preventDefault();
		close();
		store.viewer.scrollEl?.focus({ preventScroll: true });
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-selection-menu': '',
			'data-state': open ? 'open' : 'closed',
			'data-pdf-annotation-ui': '',
			role: 'toolbar',
			'aria-label': store.viewer.t('annotateSelection'),
			// Keep the selection when clicking the menu.
			onpointerdown: (e: PointerEvent) => e.preventDefault(),
			onkeydown: onKeydown,
			...refAttachment
		})
	);
	const snippetProps = $derived({ open, text: sel.text, markup, comment, copy, close });
</script>

{#if open || forceMount}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else if open}
		<div {...mergedProps}>
			{#if children}
				{@render children(snippetProps)}
			{:else}
				{#each store.palette.slice(0, 5) as c, i (c.key)}
					<button
						type="button"
						tabindex={i === 0 ? 0 : -1}
						data-part="swatch"
						data-color={c.key}
						aria-label={store.viewer.t('highlightColor', { color: c.label })}
						title="{c.label} ({i + 1})"
						style:--swatch={c.light}
						onclick={() => markup('highlight', c.key)}
					></button>
				{/each}
				<span data-part="sep" aria-hidden="true"></span>
				{#each actions as action (action.part)}
					<button
						type="button"
						tabindex="-1"
						data-part={action.part}
						aria-label={action.label}
						title={action.key ? `${action.label} (${action.key})` : action.label}
						onclick={action.run}><Icon name={action.icon} /></button
					>
				{/each}
			{/if}
		</div>
	{/if}
{/if}

<style>
	/* Positioned by floating-ui (fixed strategy). */
	:global(:where([data-pdf-selection-menu])) {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 40;
	}
</style>
