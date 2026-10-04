import type { RequestHandler } from './$types';
import { contentSections } from '#lib/config/navigation.ts';

const rawDisallow = contentSections.map((section) => `Disallow: ${basePath}/${section.id}/raw/`);
const directives = ['User-agent: *', `Allow: ${basePath}/`, ...rawDisallow];

import { basePath, siteUrl } from '#lib/utils/paths.ts';

export const GET: RequestHandler = () => {
	const lines = [...directives, `Sitemap: ${siteUrl('/sitemap.xml')}`];
	const body = lines.join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};

export const prerender = true;
