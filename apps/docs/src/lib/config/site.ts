/**
 * Canonical site-level metadata shared across SEO tags, manifests, and feeds.
 * Keep this object project-specific when using the docs template for a new brand.
 */
export const siteConfig = {
	/** Primary site name used in titles and Open Graph site fields. */
	name: 'svelte-pdf-mini',
	/** Compact site name for environments with strict length limits. */
	shortName: 'svelte-pdf-mini',
	/** Public origin; absolute links add the base path (see `siteUrl` in utils/paths). */
	url: 'https://julien-blanchon.github.io',
	/** Default SEO description for the homepage and fallback metadata. */
	description:
		'Headless, composable PDF viewer and research-paper reader components for Svelte 5. Virtualised rendering, find, annotations that round-trip through standard PDF, citations, tables of contents and more.',
	/** Author shown in metadata and structured data. */
	author: 'Julien Blanchon',
	/** Primary SEO keywords for indexing and discovery. */
	keywords: ['svelte', 'svelte 5', 'pdf', 'pdf.js', 'pdf viewer', 'annotations', 'research papers', 'arxiv', 'headless components', 'runes'],
	/** Default social preview image endpoint. */
	ogImage: '/og.png',
	/** Browser chrome colors synchronized with the light and dark inset surfaces. */
	themeColor: {
		light: '#f7f7f8',
		dark: '#17181a'
	},
	/** External profile links used by docs actions and metadata. */
	links: {
		github: 'https://github.com/julien-blanchon/svelte-pdf-mini',
		twitter: ''
	},
	/** Package metadata used in installation snippets and docs helpers. */
	package: {
		name: 'svelte-pdf-mini'
	}
};

