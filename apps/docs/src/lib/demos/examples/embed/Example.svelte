<script module lang="ts">
	export const meta = {
		title: 'Embedded in an article',
		description: 'A blog-style article with the paper embedded inline: one page at a time, citation cards on hover, figure previews, and an "open full paper" link.',
		order: 104,
		kind: 'app'
	} as const;
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { Document, PageNav, Paper, Viewer } from 'svelte-pdf-mini';
	import { arxivPdf } from '#lib/demos/papers.ts';

	const id = '1512.03385';
	let page = $state(1);
</script>

<article class="h-full overflow-y-auto bg-white dark:bg-stone-950">
	<div class="mx-auto max-w-2xl px-6 py-12 font-serif text-[17px] leading-relaxed text-stone-800 dark:text-stone-200">
		<p class="font-sans text-sm text-stone-500">Reading group · week 3</p>
		<h1 class="mt-2 text-3xl leading-tight">Why residual connections made very deep networks trainable</h1>
		<p class="mt-6">
			In 2015, He et al. observed something odd: adding layers to a plain network made <em>training</em> error worse, not just test error. Their fix was to let each block learn a residual
			<code class="font-mono text-sm">F(x) = H(x) − x</code> on top of an identity shortcut. Have a look at page 1 and the introduction below; hover the bracketed citations to see what they refer to.
		</p>

		<figure class="not-prose my-8 -mx-6 overflow-hidden rounded-xl border border-stone-200 shadow-sm sm:mx-0 dark:border-stone-800">
			<Document.Root src={arxivPdf(id)}>
				<Viewer.Root bind:page scrollMode="page" zoomMode="page-width" wheelZoom={false} class="font-sans">
					<Paper.Root>
						<div class="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900">
							<span class="min-w-0 flex-1 truncate font-medium">Deep Residual Learning for Image Recognition</span>
							<PageNav.Prev class="rounded px-2 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-stone-700"><span class="icon-[lucide--chevron-left] size-4"></span></PageNav.Prev>
							<span class="tabular-nums text-stone-500">{page}</span>
							<PageNav.Next class="rounded px-2 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-stone-700"><span class="icon-[lucide--chevron-right] size-4"></span></PageNav.Next>
							<a href="{resolve('/demo/[slug]', { slug: 'reader' })}?paper={id}" class="rounded-md bg-stone-900 px-2.5 py-1 text-xs text-white dark:bg-stone-100 dark:text-stone-900">Open full paper <span class="icon-[lucide--arrow-up-right] size-3.5 align-[-2px]"></span></a>
						</div>
						<Viewer.Viewport class="h-[560px] bg-stone-100 [--pdf-pages-padding:0] [--pdf-page-shadow:none] dark:bg-stone-900">
							<Viewer.Pages>
								{#snippet children({ pageNumber })}
									<Viewer.Page {pageNumber}>
										<Viewer.Canvas />
										<Viewer.TextLayer />
										<Paper.Layer />
										<Viewer.Focus />
									</Viewer.Page>
								{/snippet}
							</Viewer.Pages>
						</Viewer.Viewport>
						<Paper.CitationCard />
						<Paper.CrossRefPreview />
					</Paper.Root>
				</Viewer.Root>
			</Document.Root>
			<figcaption class="bg-stone-50 px-4 py-2 font-sans text-xs text-stone-500 dark:bg-stone-900">He, Zhang, Ren &amp; Sun (2015), arXiv:{id}. Use ‹ › to turn pages.</figcaption>
		</figure>

		<p>
			The key result is in Figure 1: the 56-layer plain network has higher training error than the 20-layer one. Residual networks remove this gap, which is why almost every modern architecture,
			Transformers included, has shortcuts around each block.
		</p>
		<p class="mt-4">Next week: <em>Attention Is All You Need</em>.</p>
	</div>
</article>
