<script lang="ts">
	import 'svelte-pdf-mini/styles.css';
	import './layout.css';
	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import { siteUrl } from '#lib/utils/paths.ts';
	import { CommandPalette, contentUiDefaults, siteConfig } from '#lib/index.ts';
	import { getContentSectionByPathname, getContentSectionUiConfig } from '#lib/content/sections.ts';
	import { themeStore } from '#lib/stores/theme.svelte.ts';
	import type { SectionUiConfig } from '#lib/config/content-ui.ts';
	import { type Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();

	const currentPage = page;

	const isHomePath = (path?: string) => path === '/';

	const currentUrl = $derived(currentPage.url);
	const currentPath = $derived(currentUrl.pathname);
	const isHomeRoute = $derived(isHomePath(currentPath));
	const currentSection = $derived(getContentSectionByPathname(currentPath));
	const currentSectionUi = $derived(
		currentSection ? getContentSectionUiConfig(currentSection.id) : null
	);
	const searchConfig = $derived<SectionUiConfig['search']>(
		currentSectionUi?.search ?? contentUiDefaults.search
	);
	const showCommandPalette = $derived(Boolean(currentSection) && searchConfig.enabled);
	const siteOrigin = new URL(siteConfig.url).origin;
	const canonicalUrl = $derived(new URL(currentPath, siteOrigin).href);

	const siteName = siteConfig.name;
	const authorName = siteConfig.author;
	const homeTitle = `${siteConfig.name} — ${siteConfig.description.split('.')[0]}`;
	const homeDescription = siteConfig.description;
	const homeKeywords = siteConfig.keywords.join(', ');
	const sharedOgImage = siteUrl(siteConfig.ogImage);
	const homeStructuredData = $derived.by(() =>
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: siteName,
			alternateName: siteConfig.shortName,
			url: canonicalUrl,
			applicationCategory: 'DeveloperApplication',
			operatingSystem: 'Any',
			description: homeDescription,
			image: sharedOgImage,
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD'
			},
			provider: {
				'@type': 'Person',
				name: authorName
			}
		})
	);
</script>

<svelte:head>
	<meta
		name="theme-color"
		content={themeStore.isDark ? siteConfig.themeColor.dark : siteConfig.themeColor.light}
	/>
	<meta
		name="docs-package-manager-storage-key"
		content={contentUiDefaults.packageManager.storageKey}
	/>
	<meta name="docs-package-manager-default" content={contentUiDefaults.packageManager.default} />
	<meta
		name="docs-package-manager-enabled"
		content={contentUiDefaults.packageManager.enabled.join(',')}
	/>
	<meta property="og:site_name" content={siteName} />
	<meta property="og:locale" content="en_US" />
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="icon" type="image/svg+xml" href={asset('favicon.svg')} />
	<link rel="icon" type="image/png" sizes="96x96" href={asset('favicon-96x96.png')} />
	<link rel="icon" type="image/x-icon" href={asset('favicon.ico')} />
	<link rel="apple-touch-icon" sizes="180x180" href={asset('apple-touch-icon.png')} />
	<link rel="manifest" href={asset('site.webmanifest')} />
	<link rel="mask-icon" href={asset('favicon.svg')} color="#1f2125" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content={siteName} />
	{#if isHomeRoute}
		<title>{homeTitle}</title>
		<meta name="description" content={homeDescription} />
		<meta name="keywords" content={homeKeywords} />
		<meta name="author" content={authorName} />
		<link rel="canonical" href={canonicalUrl} />
		<meta property="og:title" content={homeTitle} />
		<meta property="og:description" content={homeDescription} />
		<meta property="og:type" content="website" />
		<meta property="og:url" content={canonicalUrl} />
		<meta property="og:image" content={sharedOgImage} />
		<meta property="og:image:alt" content={`${siteName} logomark`} />
		<meta property="og:image:type" content="image/png" />
		<meta name="twitter:title" content={homeTitle} />
		<meta name="twitter:description" content={homeDescription} />
		<meta name="twitter:image" content={sharedOgImage} />
		<svelte:element this={'script'} type="application/ld+json">
			{homeStructuredData}
		</svelte:element>
	{:else if !currentSection}
		<title>{siteName}</title>
		<meta name="description" content={homeDescription} />
		<link rel="canonical" href={canonicalUrl} />
	{/if}
</svelte:head>

{#if showCommandPalette}
	<CommandPalette {searchConfig} />
{/if}
{@render children()}
