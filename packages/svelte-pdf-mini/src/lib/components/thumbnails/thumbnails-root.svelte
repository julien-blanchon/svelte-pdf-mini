<script lang="ts" module>
	import { Context } from 'runed';
	export interface ThumbnailsContextValue {
		width: number;
		follow: boolean;
		/** Calls `onVisible` once `el` nears the scroll area. Returns a cleanup. */
		observe: (el: Element, onVisible: () => void) => () => void;
	}
	export const ThumbnailsContext = new Context<ThumbnailsContextValue>('Thumbnails.Root');
</script>

<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import { createAttachmentKey } from 'svelte/attachments';
	import { ViewerContext } from '../../state/context.js';
	import { handleRovingKey } from '../../internal/roving.js';
	import type { ThumbnailsRootProps } from './types.js';

	let {
		width = 120,
		followCurrent = true,
		ref = $bindable(null),
		child,
		children,
		...rest
	}: ThumbnailsRootProps = $props();
	const viewer = ViewerContext.get();

	// Lazy rendering: items register here; the observer exists once the root is mounted.
	const callbacks = new WeakMap<Element, () => void>();
	const pending = new Set<Element>();
	let observer: IntersectionObserver | null = null;

	ThumbnailsContext.set({
		get width() {
			return width;
		},
		get follow() {
			return followCurrent;
		},
		observe(el, onVisible) {
			callbacks.set(el, onVisible);
			if (observer) observer.observe(el);
			else pending.add(el);
			return () => {
				observer?.unobserve(el);
				pending.delete(el);
				callbacks.delete(el);
			};
		}
	});

	function observeVisibility(node: HTMLElement) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) callbacks.get(e.target)?.();
			},
			{ root: node, rootMargin: '200px 0px' }
		);
		for (const el of pending) observer.observe(el);
		pending.clear();
		return () => {
			observer?.disconnect();
			observer = null;
		};
	}

	/** Arrows / Home / End move focus between the thumbnails (listbox keyboard). */
	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLElement }) {
		const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-pdf-thumbnail]')];
		const owner =
			e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pdf-thumbnail]') : null;
		const index = owner ? items.indexOf(owner) : -1;
		if (index < 0) return;
		handleRovingKey(e, index, items.length, {
			orientation: 'both',
			loop: false,
			focus: (i) => items[i].focus()
		});
	}

	const observeKey = createAttachmentKey();
	const refAttachment = attachRef<HTMLDivElement>((node) => (ref = node));
	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-thumbnails': '',
			role: 'listbox',
			'aria-label': viewer.t('pages'),
			onkeydown,
			[observeKey]: observeVisibility,
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<div {...mergedProps}>
		{@render children?.({})}
	</div>
{/if}

<style>
	@layer svelte-pdf-mini {
		:global(:where([data-pdf-thumbnails])) {
			overflow: auto;
		}
	}
</style>
