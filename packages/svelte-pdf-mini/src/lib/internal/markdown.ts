/**
 * Comment rendering: basic Markdown (bold, italic, code, links, lists, quotes)
 * plus LaTeX maths ($…$ inline, $$…$$ display) via KaTeX, sanitised with
 * DOMPurify. Libraries are loaded on first use.
 */
let libs: Promise<{
	marked: typeof import('marked').marked;
	katex: typeof import('katex').default;
	purify: typeof import('dompurify').default;
}> | null = null;

function load() {
	libs ??= Promise.all([
		import('marked'),
		import('katex'),
		import('dompurify'),
		import('katex/dist/katex.min.css').catch(() => null)
	]).then(([m, k, d]) => ({ marked: m.marked, katex: k.default, purify: d.default }));
	return libs;
}

const cache = new Map<string, string>();

/** Does the text use anything worth rendering (otherwise show it as plain text)? */
export function hasMarkup(src: string): boolean {
	return /[*_`$[\]#>~-]|^\s*\d+\./m.test(src);
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
		.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, lead, tex) => lead + stash(tex, false));
	let html = await marked.parse(pre, { gfm: true, breaks: true, async: true });
	html = html.replace(/@@MATH(\d+)@@/g, (_, i) => math[Number(i)]);
	const clean = purify.sanitize(html, {
		USE_PROFILES: { html: true, mathMl: true },
		ADD_ATTR: ['target']
	});
	// Links open in a new tab, safely.
	const out = clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
	cache.set(src, out);
	return out;
}
