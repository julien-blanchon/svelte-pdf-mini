<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Annotation, TextMarkupKind } from '../../core/annotations/model.js';
	import { isTextMarkup, TEXT_MARKUP_KINDS } from '../../core/annotations/model.js';
	import { float } from '../../internal/floating.js';
	import Icon from '../../internal/Icon.svelte';
	import { handleRovingKey } from '../../internal/roving.js';
	import { dataAttr } from '../../internal/types.js';
	import { AnnotationsContext } from '../../state/context.js';
	import Comment from './annotations-comment.svelte';
	import ColorRadio from './color-radio.svelte';
	import { annotationSelector, snippetPropsFor } from './helpers.js';
	import type { AnnotationsPopoverProps } from './types.js';

	let {
		forceMount = false,
		onOpenChange,
		placement = 'bottom',
		showQuote = false,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: AnnotationsPopoverProps = $props();
	const store = AnnotationsContext.get();
	let el: HTMLElement | null = $state(null);

	const annotation = $derived(store.selected.length === 1 ? store.selected[0] : null);
	const reference = $derived.by(() => {
		void store.viewer.scale; // the shape re-renders on zoom
		if (!annotation) return null;
		return store.viewer.scrollEl?.querySelector(annotationSelector(annotation.id)) ?? null;
	});
	const open = $derived(!!annotation && !!reference);
	$effect(() => onOpenChange?.(open));
	/** Kept while closed so `forceMount` can run exit transitions. */
	let lastAnnotation = $state.raw<Annotation | null>(null);
	$effect(() => {
		if (annotation) lastAnnotation = annotation;
	});
	/** What to render: the selected annotation, or the last one while force-mounted. */
	const shown = $derived(open || forceMount ? (annotation ?? lastAnnotation) : null);

	$effect(() => {
		if (!open || !el || !reference) return;
		return float(reference, el, placement);
	});

	// Return focus to where it came from when the popover closes.
	let returnFocus: HTMLElement | null = null;
	$effect(() => {
		if (open) {
			returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			return;
		}
		if (returnFocus?.isConnected && el?.contains(document.activeElement))
			returnFocus.focus({ preventScroll: true });
		returnFocus = null;
	});

	const remove = () => annotation && store.remove(annotation.id);
	const close = () => {
		store.select(null);
		store.editingId = null;
	};
	/** Esc discards a just-created annotation, else closes. */
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || e.defaultPrevented) return;
		e.preventDefault();
		if (annotation && store.pendingId === annotation.id) store.discard();
		else close();
	}

	/** Shortcut hint shown in each markup style's tooltip. */
	const KIND_SHORTCUT: Record<TextMarkupKind, string> = {
		highlight: 'H',
		underline: 'U',
		strikeout: 'S',
		squiggly: '~'
	};
	const kindButtons: HTMLButtonElement[] = [];
	// Radio pattern: arrows move focus and switch the style.
	function onKindKey(e: KeyboardEvent, i: number, a: Annotation) {
		handleRovingKey(e, i, TEXT_MARKUP_KINDS.length, {
			orientation: 'both',
			focus: (next) => {
				store.update(a.id, { kind: TEXT_MARKUP_KINDS[next] });
				kindButtons[next]?.focus();
			}
		});
	}

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-annotation-popover': '',
			'data-pending': dataAttr(!!annotation && annotation.id === store.pendingId),
			'data-state': open ? 'open' : 'closed',
			'data-kind': annotation?.kind,
			role: 'dialog',
			'aria-label': store.viewer.t('annotation'),
			onkeydown: onKeydown,
			...refAttachment
		})
	);
</script>

{#if shown}
	{@const a = shown}
	{@const snippetProps = {
		...snippetPropsFor(store, a),
		open,
		selected: true,
		hovered: false,
		remove,
		close
	}}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else if open}
		<div {...mergedProps}>
			{#if children}
				{@render children(snippetProps)}
			{:else}
				{#if snippetProps.editable}
					<div data-part="toolbar">
						<ColorRadio value={a.paletteKey} onSelect={(key) => store.recolor([a.id], key)} />
						{#if isTextMarkup(a)}
							{@const current = Math.max(0, TEXT_MARKUP_KINDS.indexOf(a.kind))}
							<span data-part="sep" aria-hidden="true"></span>
							<div role="radiogroup" aria-label={store.viewer.t('markupStyle')} data-part="kinds">
								{#each TEXT_MARKUP_KINDS as k, i (k)}
									<button
										type="button"
										role="radio"
										bind:this={kindButtons[i]}
										aria-checked={a.kind === k}
										tabindex={i === current ? 0 : -1}
										data-part="kind"
										data-active={dataAttr(a.kind === k)}
										aria-label={store.viewer.t(`tool_${k}`)}
										title="{store.viewer.t(`tool_${k}`)} ({KIND_SHORTCUT[k]})"
										onclick={() => store.update(a.id, { kind: k })}
										onkeydown={(e) => onKindKey(e, i, a)}
									>
										<Icon name={k} />
									</button>
								{/each}
							</div>
						{/if}
						<span data-part="sep" aria-hidden="true"></span>
						<button
							type="button"
							data-part="delete"
							aria-label={store.viewer.t('delete')}
							title="{store.viewer.t('delete')} (Del)"
							onclick={remove}><Icon name="trash" /></button
						>
					</div>
				{/if}
				{#if a.kind === 'area' && snippetProps.editable}
					<input
						data-part="label"
						aria-label={store.viewer.t('label')}
						placeholder={store.viewer.t('label')}
						value={a.label ?? ''}
						oninput={(e) => store.update(a.id, { label: e.currentTarget.value || undefined })}
						onkeydown={(e) => {
							e.stopPropagation();
							store.handleNoteKey(e, a);
						}}
					/>
				{/if}
				{#if showQuote && 'quote' in a && a.quote?.exact}
					<blockquote data-part="quote">{a.quote.exact}</blockquote>
				{/if}
				<!-- A text box's own text is edited on the page; this is its separate comment. -->
				<Comment
					annotation={a}
					autofocus={store.editingId === a.id && a.kind !== 'freetext'}
					data-part="comment"
				/>
				{#each store.replies.get(a.id) ?? [] as r (r.id)}
					<div data-part="reply">
						<strong>{r.author?.name ?? store.viewer.t('reply')}</strong>
						{r.contents}
					</div>
				{/each}
				{#if store.pendingId === a.id}
					<p data-part="hint">
						<kbd>↵</kbd>
						{store.viewer.t('pendingKeep')} · <kbd>Esc</kbd>
						{store.viewer.t('pendingDiscard')} · <kbd>1–9</kbd>
						{store.viewer.t('pendingColor')}
					</p>
				{:else if a.author?.name}<p data-part="meta">
						{a.author.name} · {new Date(a.modifiedAt).toLocaleString()}
					</p>{/if}
			{/if}
		</div>
	{/if}
{/if}

<style>
	/* Positioned by floating-ui (fixed strategy). */
	:global(:where([data-pdf-annotation-popover])) {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 40;
	}
</style>
