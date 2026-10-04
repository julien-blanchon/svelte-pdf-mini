import { resolve } from '$app/paths';
import { siteConfig } from '#lib/config/site.ts';

/** Base path the site is served from: '' locally, '/svelte-pdf-mini' on GitHub Pages. */
export const basePath = resolve('/').replace(/\/$/, '');

/** A pathname without the base path (content lookups use base-less paths). */
export function stripBase(pathname: string) {
	if (!basePath || !pathname.startsWith(basePath)) return pathname;
	return pathname.slice(basePath.length) || '/';
}

/** Absolute public URL of a base-less path (canonical links, sitemap, metadata). */
export function siteUrl(path = '/') {
	return siteConfig.url.replace(/\/$/, '') + basePath + (path.startsWith('/') ? path : `/${path}`);
}
