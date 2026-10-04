<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { Reference } from '../../core/paper/types.js';
	import { float } from '../../internal/floating.js';
	import { PaperContext } from '../../state/context.js';
	import { PaperHoverIntent } from './hover-intent.svelte.js';
	import { formatAuthors, referenceView, resolveLayout } from './reference-view.js';
	import type { CitationCardSnippetProps, PaperCitationCardProps } from './types.js';

	let {
		delay = 200,
		layout = 'auto',
		placement = 'top',
		forceMount = false,
		onOpenChange,
		onReferenceClick,
		reference: referenceSnippet,
		actions,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: PaperCitationCardProps = $props();
	const paper = PaperContext.get();
	let el: HTMLElement | null = $state(null);
	/** Reference shown in 'pager' layout. */
	let index = $state(0);

	const hover = new PaperHoverIntent(paper, 'citation', {
		delay: () => delay,
		instantSwitch: true,
		onShow: (next, previous) => {
			if (previous?.id !== next.id) index = 0;
		}
	});
	const open = $derived(hover.open);
	$effect(() => onOpenChange?.(open));

	const citation = $derived.by(() => {
		const current = hover.current;
		return current ? (paper.citations.find((c) => c.id === current.id) ?? null) : null;
	});
	const references = $derived(
		citation?.referenceIds
			.map((id) => paper.referenceById.get(id))
			.filter((r): r is Reference => !!r) ?? []
	);
	const reference = $derived(references[Math.min(index, references.length - 1)] ?? null);
	const metadata = $derived(reference ? paper.metadata.get(reference.id) : undefined);
	const mode = $derived(resolveLayout(layout, references.length));

	// Fetch enrichment for what is on display.
	$effect(() => {
		if (!open) return;
		if (mode === 'list') references.forEach((r) => paper.resolve(r));
		else if (reference) paper.resolve(reference);
	});
	$effect(() => {
		const anchor = hover.current?.anchor;
		if (!el || !anchor || !open) return;
		return float(anchor, el, placement);
	});

	const go = (r: Reference, e?: Event) => {
		if (citation && onReferenceClick?.(r, citation, e) === false) return;
		paper.hovered = null;
		paper.goToReference(r);
	};
	const step = (by: 1 | -1) => (index = (index + by + references.length) % references.length);

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-citation-card': '',
			'data-state': open ? 'open' : 'closed',
			'data-layout': mode,
			role: 'dialog',
			'aria-label': paper.viewer.t('reference'),
			onpointerleave: () => (paper.hovered = null),
			...refAttachment
		})
	);
</script>

{#snippet defaultReference(r: Reference, compact: boolean)}
	{@const meta = paper.metadata.get(r.id)}
	{@const view = referenceView(r, meta)}
	<div data-part="reference" data-compact={compact ? '' : undefined}>
		{#if referenceSnippet}
			{@render referenceSnippet({
				reference: r,
				metadata: meta,
				go: (e?: Event) => go(r, e),
				compact
			})}
		{:else}
			<button type="button" data-part="title" onclick={(e) => go(r, e)}>
				{#if compact}<span data-part="label">{r.label}</span>{/if}
				{view.title}
			</button>
			<p data-part="authors">
				{formatAuthors(view.authors, compact ? 2 : 4)}
				{#if view.year}· {view.year}{/if}
				{#if !compact && view.venue}· <em>{view.venue}</em>{/if}
			</p>
			{#if !compact && view.summary}<p data-part="abstract">
					{view.summary}
				</p>{/if}
			<footer data-part="footer">
				{#if !compact}<button type="button" onclick={(e) => go(r, e)}
						>{paper.viewer.t('goToReference')}</button
					>{/if}
				{#if view.citationCount != null}<span
						>{paper.viewer.t('citedBy', { count: view.citationCount.toLocaleString() })}</span
					>{/if}
				{#if view.arxivUrl}
					<a href={view.arxivUrl} target="_blank" rel="noopener noreferrer">arXiv</a>
				{/if}
				{#if view.doiUrl}
					<a href={view.doiUrl} target="_blank" rel="noopener noreferrer">DOI</a>
				{/if}
				{#if actions}{@render actions({ reference: r, metadata: meta })}{/if}
				{#if view.loading}<span data-part="loading">{paper.viewer.t('lookingUp')}</span>{/if}
			</footer>
		{/if}
	</div>
{/snippet}

{#if (open || forceMount) && citation && reference}
	{@const snippetProps: CitationCardSnippetProps = {
		open,
		citation,
		references,
		index,
		reference,
		metadata,
		layout: mode,
		next: () => step(1),
		prev: () => step(-1),
		go: (r: Reference = reference) => go(r)
	}}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else if open}
		<div {...mergedProps}>
			{#if children}
				{@render children(snippetProps)}
			{:else if mode === 'list'}
				<header data-part="header">
					<span>{citation.text}</span><span>{references.length}</span>
				</header>
				{#each references as r (r.id)}{@render defaultReference(r, true)}{/each}
			{:else}
				<header data-part="header">
					<span data-part="label">{reference.label}</span>
					{#if references.length > 1}
						<span data-part="pager">
							<button
								type="button"
								onclick={snippetProps.prev}
								aria-label={paper.viewer.t('prevReference')}>‹</button
							>
							{index + 1}/{references.length}
							<button
								type="button"
								onclick={snippetProps.next}
								aria-label={paper.viewer.t('nextReference')}>›</button
							>
						</span>
					{/if}
				</header>
				{@render defaultReference(reference, false)}
			{/if}
		</div>
	{/if}
{/if}

<style>
	:global(:where([data-pdf-citation-card])) {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 50;
	}
</style>
