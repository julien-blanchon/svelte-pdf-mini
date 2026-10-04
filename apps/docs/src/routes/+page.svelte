<script lang="ts">
	import { resolve } from '$app/paths';
	/** Section links (typed as plain paths, like the content navigation). */
	const link = (path: string) => resolve(path);
	import { brandingConfig, siteConfig } from '#lib/index.ts';
	import Demo from '#lib/components/docs/Demo.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import { copyToClipboard } from '#lib/utils/copy.ts';

	const install = 'bun add svelte-pdf-mini';
	let copied = $state(false);
	async function copy() {
		await copyToClipboard(install);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	const features = [
		{ icon: 'icon-[lucide--gauge]', title: 'A fast viewer', text: 'Virtualised pages, a cancellable render scheduler, eased zoom that stays centred, one to four pages per row and pinch-zoom on touch.' },
		{ icon: 'icon-[lucide--highlighter]', title: 'Annotations that survive', text: 'Highlights, boxes, notes, ink and side notes — exported as standard PDF annotations and read back exactly.' },
		{ icon: 'icon-[lucide--book-open-text]', title: 'Research-paper aids', text: 'Citations with hover cards, figure previews, references and five table-of-contents views, from the PDF alone.' },
		{ icon: 'icon-[lucide--search]', title: 'Find and select', text: 'A shared text index: search ignoring accents and hyphenation, clean copy, quotes mapped to PDF geometry.' },
		{ icon: 'icon-[lucide--sun-moon]', title: 'Page themes', text: 'A calm paper tint by day and a hue-preserving recolour at night — plus invert, smart invert and your own.' },
		{ icon: 'icon-[lucide--blocks]', title: 'Headless & composable', text: 'Compound parts, child snippets, bindable state and data attributes — compose with bits-ui and melt-ui.' }
	];
</script>

<svelte:head>
	<title>{siteConfig.name} — PDF viewer & research-paper reader components for Svelte 5</title>
	<meta name="description" content={siteConfig.description} />
</svelte:head>

<a href="#main-content" class="sr-only fixed top-3 left-3 z-100 rounded-sm bg-foreground px-4 py-2 text-sm text-background-inset focus:not-sr-only">Skip to main content</a>

<div class="min-h-dvh bg-background-inset">
	<header class="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
		<a href={resolve('/')} class="flex items-center gap-2 text-foreground no-underline">
			<span class="inline-flex text-accent [&_svg]:size-6 [&_svg]:fill-current" aria-hidden="true">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html brandingConfig.logoRaw}
			</span>
			<span class="font-medium tracking-tight">{brandingConfig.name}</span>
		</a>
		<nav class="flex items-center gap-1 text-sm" aria-label="Main">
			<a class="rounded-md px-3 py-2 text-foreground-muted no-underline hover:bg-background-muted hover:text-foreground" href={link('/docs')}>Docs</a>
			<a class="rounded-md px-3 py-2 text-foreground-muted no-underline hover:bg-background-muted hover:text-foreground" href={link('/components')}>Components</a>
			<a class="rounded-md px-3 py-2 text-foreground-muted no-underline hover:bg-background-muted hover:text-foreground" href={link('/examples')}>Examples</a>
			<ThemeToggle />
		</nav>
	</header>

	<main id="main-content" tabindex="-1" class="mx-auto max-w-6xl px-6 pb-24 outline-none">
		<section class="grid gap-10 pt-12 pb-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-20">
			<div>
				<p class="mb-4 inline-flex items-center gap-2 rounded-full border border-background-muted bg-background px-3 py-1 text-xs font-medium text-foreground-muted">
					<span class="size-1.5 rounded-full bg-accent"></span> Svelte 5 · pdf.js 6 · headless
				</p>
				<h1 class="text-4xl leading-[1.08] font-medium tracking-tight text-balance text-foreground md:text-5xl">
					PDF viewer and research-paper reader components for Svelte.
				</h1>
				<p class="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-foreground-muted">
					Build anything from a twenty-line viewer to a full reader with highlights, side notes, citation cards and tables of contents — with compound, unstyled parts you compose and style your way.
				</p>
				<div class="mt-8 flex flex-wrap items-center gap-3">
					<a href={link('/docs')} class="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background no-underline transition-opacity hover:opacity-90">
						Get started <span class="icon-[lucide--arrow-right] size-4"></span>
					</a>
					<button type="button" onclick={copy} class="group inline-flex items-center gap-3 rounded-md border border-background-muted bg-background px-4 py-2.5 font-mono text-sm text-foreground transition-colors hover:border-foreground-muted/40" aria-label="Copy install command">
						<span class="text-foreground-muted">$</span>{install}
						<span class="{copied ? 'icon-[lucide--check] text-accent' : 'icon-[lucide--copy] text-foreground-muted'} size-4"></span>
					</button>
				</div>
			</div>
			<div class="card-outer rounded-xl bg-background p-1.5 shadow-sm">
				<Demo example="minimal" height={520} code={false} />
			</div>
		</section>

		<section aria-labelledby="features" class="border-t border-background-muted pt-14">
			<h2 id="features" class="sr-only">Features</h2>
			<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as f (f.title)}
					<li class="rounded-xl border border-background-muted bg-background p-5">
						<span class="{f.icon} size-5 text-accent"></span>
						<h3 class="mt-3 font-medium text-foreground">{f.title}</h3>
						<p class="mt-1.5 text-sm leading-relaxed text-foreground-muted">{f.text}</p>
					</li>
				{/each}
			</ul>
		</section>

		<section class="mt-14 grid gap-4 md:grid-cols-3">
			{#each [{ href: '/docs/quick-start', title: 'Quick start', text: 'Build a reader step by step.' }, { href: '/components', title: 'Components', text: 'Every part with its generated API.' }, { href: '/examples', title: 'Examples', text: 'Complete apps, with source.' }] as l (l.href)}
				<a href={link(l.href)} class="group rounded-xl border border-background-muted bg-background p-5 no-underline transition-colors hover:border-foreground-muted/40">
					<span class="flex items-center justify-between font-medium text-foreground">{l.title}<span class="icon-[lucide--arrow-up-right] size-4 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"></span></span>
					<span class="mt-1 block text-sm text-foreground-muted">{l.text}</span>
				</a>
			{/each}
		</section>
	</main>
</div>
