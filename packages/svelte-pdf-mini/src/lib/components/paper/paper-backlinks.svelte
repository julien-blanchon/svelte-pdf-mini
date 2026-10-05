<!--
	Backlinks: hover a label that is mentioned elsewhere ("Figure 3", an
	equation's "(2)", a section heading) to see every place the text refers to
	it, with the surrounding sentence; click one to jump there.
-->
<script lang="ts">
	import { watch } from 'runed';
	import { untrack } from 'svelte';
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { CrossRef } from '../../core/paper/types.js';
	import { float } from '../../internal/floating.js';
	import { cssVars } from '../../internal/style.js';
	import { PaperContext } from '../../state/context.js';
	import { PaperHoverIntent } from './hover-intent.svelte.js';
	import type { BacklinkMention, PaperBacklinksProps } from './types.js';

	let {
		width = 380,
		delay = 300,
		placement = 'top',
		forceMount = false,
		onOpenChange,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: PaperBacklinksProps = $props();
	const paper = PaperContext.get();
	let el: HTMLElement | null = $state(null);

	const hover = new PaperHoverIntent(paper, 'backlinks', { delay: () => delay });
	const open = $derived(hover.open);
	// Changes only (not the initial state), untracked: the callback's reads don't re-run it.
	watch(
		() => open,
		(o) => onOpenChange?.(o),
		{ lazy: true }
	);

	const targetId = $derived(hover.current?.id ?? null);
	const label = $derived.by(() => {
		if (!targetId) return '';
		const fig = paper.figureById.get(targetId);
		if (fig) return fig.label;
		const sec = paper.flatSections.find((s) => s.id === targetId);
		return sec ? [sec.number, sec.title].filter(Boolean).join(' ') : '';
	});
	const crossRefs = $derived(targetId ? (paper.mentions.get(targetId) ?? []) : []);

	/** Sentence around each mention, from the page text (loaded on open). */
	let context = $state.raw(new Map<string, { before: string; after: string }>());
	$effect(() => {
		const list = crossRefs;
		if (!open || !list.length) return;
		let cancelled = false;
		(async () => {
			// Untracked: this effect writes `context`, so reading it here would loop.
			const next = untrack(() => new Map(context));
			let added = false;
			for (const x of list) {
				if (next.has(x.id)) continue;
				const raw = (await paper.viewer.document.getPageText(x.page)).raw;
				next.set(x.id, sentenceAround(raw, x));
				added = true;
			}
			if (added && !cancelled) context = next;
		})().catch(() => {});
		return () => (cancelled = true);
	});

	function sentenceAround(raw: string, x: CrossRef) {
		const flat = (s: string) => s.replace(/-\n/g, '').replace(/\s+/g, ' ');
		let before = flat(raw.slice(Math.max(0, x.start - 160), x.start));
		let after = flat(raw.slice(x.end, x.end + 160));
		const startAt = before.search(/[.!?]\s+(?=[A-Z(])[^.!?]*$/);
		before = startAt >= 0 ? before.slice(startAt + 2) : `…${before.trimStart()}`;
		const endAt = after.search(/[.!?](\s|$)/);
		after = endAt >= 0 ? after.slice(0, endAt + 1) : `${after.trimEnd()}…`;
		return { before, after };
	}

	const mentions = $derived<BacklinkMention[]>(
		crossRefs.map((x) => ({
			crossRef: x,
			page: x.page,
			pageLabel: paper.viewer.document.pageLabel(x.page),
			before: context.get(x.id)?.before ?? '',
			text: x.text,
			after: context.get(x.id)?.after ?? '',
			go: () => {
				paper.hovered = null;
				paper.goToMention(x);
			}
		}))
	);

	$effect(() => {
		const anchor = hover.current?.anchor;
		if (!el || !anchor || !open) return;
		return float(anchor, el, placement);
	});

	const refAttachment = attachRef<HTMLDivElement>((node) => {
		ref = node;
		el = node;
	});
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-backlinks': '',
			'data-state': open ? 'open' : 'closed',
			// The app runs its own transitions: no default entry animation.
			'data-force-mount': forceMount ? '' : undefined,
			role: 'dialog',
			'aria-label': paper.viewer.t('mentionsOf', { label }),
			style: cssVars({ '--pdf-backlinks-width': `${width}px` }),
			onpointerleave: () => (paper.hovered = null),
			...refAttachment
		})
	);
	const snippetProps = $derived({ open, label, mentions });
</script>

{#if targetId && mentions.length && (open || forceMount)}
	{#if child}
		{@render child({ props: mergedProps, ...snippetProps })}
	{:else if open}
		<div {...mergedProps}>
			{#if children}
				{@render children(snippetProps)}
			{:else}
				<p data-part="title">{paper.viewer.t('mentionsOf', { label })}</p>
				<ul data-part="list">
					{#each mentions as m (m.crossRef.id)}
						<li>
							<button type="button" data-part="mention" onclick={m.go}>
								<span data-part="page">{paper.viewer.t('pageShort', { page: m.pageLabel })}</span>
								<span data-part="quote">{m.before}<mark>{m.text}</mark>{m.after}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
{/if}

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-backlinks])) {
			position: fixed;
			left: 0;
			top: 0;
			z-index: 50;
			width: var(--pdf-backlinks-width);
		}
	}
</style>
