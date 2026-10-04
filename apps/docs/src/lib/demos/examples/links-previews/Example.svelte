<script module lang="ts">
	export const meta = {
		title: 'Links & previews',
		description: 'The PDF’s own links are clickable; hovering one previews its target (here restyled, with enter/exit transitions via forceMount + child). After a jump, Back (or Alt + ←) returns. onLinkClick lets the app take over: external links can ask first.',
		order: 8,
		kind: 'example'
	} as const;
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Document, Viewer } from 'svelte-pdf-mini';
	type LinkInfo = Viewer.LinkInfo;
	import { icons } from '#lib/demos/components/pdf/icons.ts';
	import { defaultPaper } from '#lib/demos/papers.ts';

	let confirmUrls = $state(true);
	let lastClick = $state('');
	function onLinkClick(link: LinkInfo) {
		lastClick = `${link.kind}${typeof link.dest === 'string' ? ` · ${link.dest}` : ''}${link.url ? ` · ${link.url}` : ''}`;
		// Return false to cancel the default (navigate / open the URL).
		if (link.url && confirmUrls && !confirm(`Open ${link.url}?`)) return false;
	}
	const kindIcon: Record<string, string> = { citation: 'icon-[lucide--quote]', figure: 'icon-[lucide--image]', table: 'icon-[lucide--table]', section: 'icon-[lucide--heading]', equation: 'icon-[lucide--sigma]', url: icons.external };
</script>

<Document.Root src={defaultPaper}>
	<Viewer.Root zoomMode="page-width" class="relative flex h-full flex-col">
		<div class="flex items-center gap-4 border-b border-stone-200 px-3 py-2 text-xs text-stone-500 dark:border-stone-800">
			<label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={confirmUrls} /> ask before opening external links (onLinkClick)</label>
			{#if lastClick}<span class="truncate">last click: <code>{lastClick}</code></span>{/if}
		</div>
		<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-900">
			<Viewer.Pages>
				{#snippet children({ pageNumber })}
					<Viewer.Page {pageNumber}>
						<Viewer.Canvas />
						<Viewer.TextLayer />
						<Viewer.LinkLayer {onLinkClick} class="[&_a]:rounded-sm [&_a:hover]:bg-blue-500/15 [&_a[data-kind=citation]:hover]:bg-emerald-500/20" />
						<Viewer.Focus />
					</Viewer.Page>
				{/snippet}
			</Viewer.Pages>
		</Viewer.Viewport>
		<Viewer.LinkPreview forceMount placement="top" width={440}>
			{#snippet child({ props, open, kind, page, url, canvasProps })}
				{#if open}
					<div {...props} transition:fly={{ y: 6, duration: 140 }} class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-stone-700 dark:bg-stone-900">
						{#if url}
							<p class="flex items-center gap-2 p-3 text-sm"><span class="{icons.external} size-4 text-stone-400"></span><span class="truncate">{url}</span></p>
						{:else}
							<div {...(canvasProps as Record<string, never>)}></div>
							<p class="flex items-center gap-1.5 border-t border-stone-100 bg-stone-50 px-3 py-1.5 text-xs text-stone-500 capitalize dark:border-stone-800 dark:bg-stone-950">
								<span class="{kindIcon[kind] ?? 'icon-[lucide--link]'} size-3.5"></span>{kind} · page {page}
							</p>
						{/if}
					</div>
				{/if}
			{/snippet}
		</Viewer.LinkPreview>
		<Viewer.BackButton class="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-black">
			{#snippet children({ label })}<span class="{icons.back} size-4"></span> Back to page {label}{/snippet}
		</Viewer.BackButton>
	</Viewer.Root>
</Document.Root>
