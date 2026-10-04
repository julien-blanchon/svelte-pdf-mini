export { default as Root } from './paper-root.svelte';
export { default as Layer } from './paper-layer.svelte';
export { default as CitationCard } from './paper-citation-card.svelte';
export { default as CrossRefPreview } from './paper-crossref-preview.svelte';
export { default as Backlinks } from './paper-backlinks.svelte';
export { default as References } from './paper-references.svelte';
export { default as Figures } from './paper-figures.svelte';
export { default as Headings } from './paper-headings.svelte';
export type {
	PaperRootProps as RootProps,
	PaperLayerProps as LayerProps,
	PaperCitationCardProps as CitationCardProps,
	PaperCrossRefPreviewProps as CrossRefPreviewProps,
	PaperBacklinksProps as BacklinksProps,
	BacklinksSnippetProps,
	BacklinkMention,
	PaperReferencesProps as ReferencesProps,
	PaperFiguresProps as FiguresProps,
	PaperHeadingsProps as HeadingsProps,
	CitationCardSnippetProps,
	ReferenceItemSnippetProps
} from './types.js';
