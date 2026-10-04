export { default as ContentNavigation } from './components/content/ContentNavigation.svelte';
export { default as TableOfContents } from './components/docs/TableOfContents.svelte';
export { default as ContentSidebar } from './components/content/ContentSidebar.svelte';
export { default as DocShareActions } from './components/docs/DocShareActions.svelte';
export { default as MobileDocShareActions } from './components/docs/MobileDocShareActions.svelte';
export { default as CommandPalette } from './components/content/search/CommandPalette.svelte';
export { default as ScrollArea } from './components/ui/ScrollArea.svelte';
export { default as InstallationTabs } from './components/docs/InstallationTabs.svelte';
export { default as Step } from './components/docs/markdown/Step.svelte';
export { default as Steps } from './components/docs/markdown/Steps.svelte';
export { default as ComponentPreview } from './components/docs/ComponentPreview.svelte';
export { default as Demo } from './components/docs/Demo.svelte';
export { default as Callout } from './components/docs/Callout.svelte';
export { default as KeymapTable } from './components/docs/KeymapTable.svelte';
export { default as ApiReference } from './components/docs/api/ApiReference.svelte';
export { default as CssVariables } from './components/docs/api/CssVariables.svelte';
export { default as DataAttributes } from './components/docs/api/DataAttributes.svelte';

export { brandingConfig } from './config/branding';
export { siteConfig, type SiteConfig } from './config/site';
export {
	availablePackageManagers,
	contentUiDefaults,
	mergeSectionUiConfig,
	resolveAssistantUrls,
	resolveRepositoryFileUrl,
	resolveTocSelector,
	type ContentUiConfig,
	type PackageManagerOption
} from './config/content-ui';

export {
	getContentSectionAdjacentItems,
	getContentSectionByPathname,
	getContentSectionConfig,
	getContentSectionHref,
	getContentSectionItemBySlug,
	getContentSectionManifest,
	getContentSectionMetadata,
	getContentSectionModule,
	getContentSectionRawHref,
	getContentSectionRawSource,
	getContentSectionSlug,
	type ContentMetadata,
	type ContentModule,
	type ContentSectionId
} from './content/sections';

export { default as brandLogoRaw } from './assets/logo.svg?raw';
