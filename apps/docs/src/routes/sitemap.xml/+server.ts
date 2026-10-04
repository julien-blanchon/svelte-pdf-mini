import type { RequestHandler } from './$types';
import { contentSections } from '#lib/config/navigation.ts';
import { getContentSectionHref, getContentSectionManifest } from '#lib/content/sections.ts';

type SitemapEntry = {
	path: string;
	changefreq?: string;
	priority?: string;
};

const staticPages: SitemapEntry[] = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/llms.txt', changefreq: 'weekly', priority: '0.4' }
];

const buildTimestamp = new Date().toISOString();

import { siteUrl } from '#lib/utils/paths.ts';

const createUrlEntry = (entry: SitemapEntry) => {
	const loc = siteUrl(entry.path);
	const changefreqTag = entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : '';
	const priorityTag = entry.priority ? `<priority>${entry.priority}</priority>` : '';

	return `<url><loc>${loc}</loc><lastmod>${buildTimestamp}</lastmod>${changefreqTag}${priorityTag}</url>`;
};

const dedupeEntries = (entries: SitemapEntry[]) => {
	const map = new Map<string, SitemapEntry>();
	for (const entry of entries) {
		if (!map.has(entry.path)) {
			map.set(entry.path, entry);
		}
	}
	return Array.from(map.values());
};

export const GET: RequestHandler = () => {
	const sectionRootEntries: SitemapEntry[] = contentSections.map((section) => ({
		path: `/${section.id}`,
		changefreq: 'weekly',
		priority: '0.9'
	}));
	const sectionEntries: SitemapEntry[] = contentSections.flatMap((section) =>
		getContentSectionManifest(section.id).map((item) => ({
			path: getContentSectionHref(section.id, item.slug),
			changefreq: 'weekly',
			priority: '0.8'
		}))
	);

	const uniqueEntries = dedupeEntries([...staticPages, ...sectionRootEntries, ...sectionEntries]);
	const body =
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
		uniqueEntries.map(createUrlEntry).join('') +
		`</urlset>`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml',
			'cache-control': 'public, max-age=3600'
		}
	});
};

export const prerender = true;
