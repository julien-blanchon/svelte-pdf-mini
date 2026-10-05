/**
 * Comment rendering: basic Markdown (bold, italic, code, links, lists, quotes)
 * plus LaTeX maths ($…$ inline, $$…$$ display) via KaTeX, sanitised with
 * DOMPurify. Libraries are loaded on first use.
 */
import { LruCache } from '../core/cache/lru.js';

let libs: Promise<{
	marked: typeof import('marked').marked;
	katex: typeof import('katex').default;
	purify: ReturnType<typeof import('dompurify').default>;
}> | null = null;

function load() {
	libs ??= Promise.all([
		import('marked'),
		import('katex'),
		import('dompurify'),
		import('katex/dist/katex.min.css').catch(() => null)
	]).then(([m, k, d]) => {
		// Our own instance: the hook must not change how the app's DOMPurify behaves.
		const purify = d.default(window);
		// Links open in a new tab, safely.
		purify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName !== 'A') return;
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		});
		return { marked: m.marked, katex: k.default, purify };
	});
	return libs;
}

/** Rendered notes, by source (count-bounded). */
const cache = new LruCache<string, string>(500);

/** Does the text use anything worth rendering (otherwise show it as plain text)? */
export function hasMarkup(src: string): boolean {
	return /[*_`$[\]#>~-]|^\s*\d+\./m.test(src);
}

/** Rendered HTML already in the cache (no flash of plain text), else undefined. */
export function cachedMarkdown(src: string): string | undefined {
	return cache.get(src);
}

/** Markdown + maths → sanitised HTML. */
export async function renderMarkdown(src: string): Promise<string> {
	const hit = cache.get(src);
	if (hit !== undefined) return hit;
	const { marked, katex, purify } = await load();
	// Pull maths out first so Markdown doesn't touch it.
	const math: string[] = [];
	const stash = (tex: string, display: boolean) => {
		math.push(
			katex.renderToString(tex, {
				displayMode: display,
				throwOnError: false,
				output: 'htmlAndMathml'
			})
		);
		return `@@MATH${math.length - 1}@@`;
	};
	const pre = src
		.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
		// Inline: no space just inside the dollars, so "$5 and $10" stays text.
		.replace(
			/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g,
			(_, lead, tex) => lead + stash(tex, false)
		);
	let html = await marked.parse(pre, { gfm: true, breaks: true, async: true });
	html = html.replace(/@@MATH(\d+)@@/g, (_, i) => math[Number(i)]);
	const out = purify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true } });
	cache.set(src, out);
	return out;
}
