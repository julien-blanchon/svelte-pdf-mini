<script lang="ts" module>
	import type { ZoomMode } from '../../core/types.js';

	type FitMode = Exclude<ZoomMode, 'manual'>;
	const FIT_MODES: readonly FitMode[] = ['auto', 'page-width', 'page-height', 'page-fit'];
	const isFitMode = (v: string): v is FitMode => (FIT_MODES as readonly string[]).includes(v);

	// Option values: a fit mode as is, a manual zoom as "z:<scale>".
	const ZOOM_PREFIX = 'z:';
	const zoomValue = (scale: number) => `${ZOOM_PREFIX}${scale}`;
	const percent = (scale: number) => `${Math.round(scale * 100)}%`;
</script>

<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { ChangeEventHandler } from 'svelte/elements';
	import { ViewerContext } from '../../state/context.js';
	import type { ZoomSelectProps } from './types.js';

	let {
		modes = ['auto', 'page-width', 'page-fit'],
		labels = {},
		ref = $bindable(null),
		child,
		children: _children,
		...rest
	}: ZoomSelectProps = $props();
	const viewer = ViewerContext.get();
	const defaultLabels: Record<FitMode, string> = $derived({
		auto: viewer.t('zoomAuto'),
		'page-width': viewer.t('zoomPageWidth'),
		'page-height': viewer.t('zoomPageHeight'),
		'page-fit': viewer.t('zoomPageFit')
	});
	const refAttachment = attachRef<HTMLSelectElement>((node) => (ref = node));
	const value = $derived(viewer.zoomMode === 'manual' ? zoomValue(viewer.zoom) : viewer.zoomMode);
	/** A manual zoom that is not one of the steps gets its own option. */
	const customZoom = $derived(
		viewer.zoomMode === 'manual' && !viewer.zoomSteps.some((s) => Math.abs(s - viewer.zoom) < 1e-3)
	);

	const onchange: ChangeEventHandler<HTMLSelectElement> = (e) => {
		const v = e.currentTarget.value;
		if (v.startsWith(ZOOM_PREFIX)) viewer.zoomTo(Number(v.slice(ZOOM_PREFIX.length)));
		else if (isFitMode(v)) viewer.zoomMode = v;
	};

	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-zoom-select': '',
			'aria-label': viewer.t('zoom'),
			value,
			onchange,
			...refAttachment
		})
	);
</script>

{#snippet options()}
	{#each modes as m (m)}
		<option value={m}>{labels[m] ?? defaultLabels[m]}</option>
	{/each}
	{#if customZoom}
		<option value={zoomValue(viewer.zoom)}>{percent(viewer.zoom)}</option>
	{/if}
	{#each viewer.zoomSteps as s (s)}
		<option value={zoomValue(s)}>{percent(s)}</option>
	{/each}
{/snippet}

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<select {...mergedProps}>{@render options()}</select>
{/if}
