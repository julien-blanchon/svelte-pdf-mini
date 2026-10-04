import type { DeepPartial, SectionUiConfig } from '#lib/config/content-ui.ts';
import { AppBookIcon, AppComponentsIcon, AppExamplesIcon } from '#lib/components/icons.ts';
import type { Component } from 'svelte';

export type ContentSectionLink = {
	label: string;
	href: string;
	icon?: Component<{ size?: number; class?: string }>;
	description?: string;
};

export type ContentSectionConfig = {
	/** URL-safe identifier used as the route segment and content directory name (`/${id}`). */
	id: string;
	label: string;
	navigation: ContentItem[];
	ui?: DeepPartial<SectionUiConfig>;
	icon?: Component;
	description?: string;
};

export type ContentItem = {
	slug: string;
	name: string;
	category?: string;
	showPagination?: boolean;
	items?: ContentItem[];
};

export const contentSections: ContentSectionConfig[] = [
	{
		id: 'docs',
		label: 'Docs',
		icon: AppBookIcon,
		description: 'Getting started, concepts and guides',
		navigation: [
			{
				slug: 'getting-started',
				name: 'Getting started',
				items: [
					{ slug: '', name: 'Introduction' },
					{ slug: 'installation', name: 'Installation' },
					{ slug: 'quick-start', name: 'Quick start' },
					{ slug: 'concepts', name: 'Concepts' }
				]
			},
			{
				slug: 'guides',
				name: 'Guides',
				items: [
					{ slug: 'viewer-layout', name: 'Viewer & layout' },
					{ slug: 'navigation', name: 'Navigation & focus' },
					{ slug: 'page-themes', name: 'Page themes' },
					{ slug: 'annotation-workflow', name: 'Annotation workflow' },
					{ slug: 'pdf-export-import', name: 'PDF export & import' },
					{ slug: 'research-papers', name: 'Research papers' },
					{ slug: 'floating-parts', name: 'Floating parts & hooks' },
					{ slug: 'context-menu', name: 'Context menus & actions' },
					{ slug: 'styling', name: 'Styling & theming' },
					{ slug: 'headless', name: 'Headless & state classes' },
					{ slug: 'core', name: 'Core utilities' },
					{ slug: 'bits-ui-melt', name: 'bits-ui & melt recipes' },
					{ slug: 'performance', name: 'Performance' },
					{ slug: 'accessibility', name: 'Accessibility' }
				]
			},
			{
				slug: 'reference',
				name: 'Reference',
				items: [
					{ slug: 'keyboard', name: 'Keyboard shortcuts' },
					{ slug: 'data-attributes', name: 'Data attributes & CSS variables' },
					{ slug: 'annotation-model', name: 'Annotation model' }
				]
			}
		]
	},
	{
		id: 'components',
		label: 'Components',
		icon: AppComponentsIcon,
		description: 'Every namespace, its parts and their API',
		navigation: [
			{ slug: '', name: 'Overview', category: 'Overview' },
			{
				slug: 'loading',
				name: 'Document & viewing',
				items: [
					{ slug: 'document', name: 'Document' },
					{ slug: 'viewer', name: 'Viewer' },
					{ slug: 'zoom', name: 'Zoom' },
					{ slug: 'page-nav', name: 'PageNav' }
				]
			},
			{
				slug: 'navigating',
				name: 'Finding & navigating',
				items: [
					{ slug: 'find', name: 'Find' },
					{ slug: 'outline', name: 'Outline' },
					{ slug: 'thumbnails', name: 'Thumbnails' },
					{ slug: 'minimap', name: 'Minimap' },
					{ slug: 'shortcut', name: 'Shortcut' }
				]
			},
			{
				slug: 'annotating',
				name: 'Annotating',
				items: [{ slug: 'annotations', name: 'Annotations' }]
			},
			{
				slug: 'papers',
				name: 'Research papers',
				items: [
					{ slug: 'paper', name: 'Paper' },
					{ slug: 'toc', name: 'Toc' }
				]
			}
		]
	},
	{
		id: 'examples',
		label: 'Examples',
		icon: AppExamplesIcon,
		description: 'Apps and feature demos built with the library',
		navigation: [
			{ slug: '', name: 'Gallery', category: 'Gallery' },
			{
				slug: 'apps',
				name: 'Apps',
				items: [
					{ slug: 'reader', name: 'Paper reader' },
					{ slug: 'annotator', name: 'Annotator' },
					{ slug: 'library', name: 'Paper library' },
					{ slug: 'compare', name: 'Compare versions' },
					{ slug: 'embed', name: 'Embedded in an article' },
					{ slug: 'mobile', name: 'Mobile reader' },
					{ slug: 'stress', name: 'Stress test' }
				]
			},
			{
				slug: 'demos',
				name: 'Feature demos',
				items: [
					{ slug: 'minimal', name: 'Minimal' },
					{ slug: 'sources', name: 'Sources & states' },
					{ slug: 'zoom', name: 'Zoom' },
					{ slug: 'scroll-modes', name: 'Scroll modes & rotation' },
					{ slug: 'layouts', name: 'Page layouts (spreads)' },
					{ slug: 'focus', name: 'Focus & navigation' },
					{ slug: 'page-themes', name: 'Page themes' },
					{ slug: 'find', name: 'Find' },
					{ slug: 'outline-thumbnails', name: 'Outline & thumbnails' },
					{ slug: 'minimap', name: 'Minimap' },
					{ slug: 'links-previews', name: 'Links & previews' },
					{ slug: 'text-selection', name: 'Text selection' },
					{ slug: 'annotations-markup', name: 'Highlights & side notes' },
					{ slug: 'annotations-draw', name: 'Boxes, drawing & notes' },
					{ slug: 'annotations-readonly', name: 'Read-only & foreign annotations' },
					{ slug: 'export-import', name: 'Export & re-import (PDF)' },
					{ slug: 'context-menu', name: 'Context menu & shortcuts' },
					{ slug: 'toc-views', name: 'Table of contents views' },
					{ slug: 'citations', name: 'Citations, references & figures' },
					{ slug: 'headless', name: 'Headless (no components)' },
					{ slug: 'bits-ui', name: 'bits-ui & melt composition' }
				]
			}
		],
		// Full-width apps: no table of contents or page actions column.
		ui: { toc: { enabled: false }, pageActions: { enabled: false } }
	}
];
