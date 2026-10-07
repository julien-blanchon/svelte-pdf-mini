import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import type { Element, ElementContent, Root, Text } from 'hast';
import { escapeSvelte, mdsvex } from 'mdsvex';
import { fileURLToPath, URL } from 'node:url';
import rehypeSlug from 'rehype-slug';
import { createHighlighter } from 'shiki';
import type { Node } from 'unist';
import { defineConfig } from 'vite';

const lib = fileURLToPath(new URL('../../packages/svelte-pdf-mini/src/lib', import.meta.url));

const tableCellFormatter = () => {
	return (tree: Root): void => {
		const ancestors: Element[] = [];

		const visit = (node: Node, parent: Root | Element | null = null, index = 0): void => {
			const isElement = node.type === 'element';
			const isRoot = node.type === 'root';

			if (isElement) {
				ancestors.push(node as Element);
			}

			if (node.type === 'text') {
				const textNode = node as Text;
				if (typeof textNode.value === 'string' && textNode.value.includes('\\|')) {
					const directParent = ancestors[ancestors.length - 1];
					const grandParent = ancestors[ancestors.length - 2];
					const isCodeBlock = directParent.tagName === 'code' && grandParent.tagName === 'pre';

					if (!isCodeBlock) {
						textNode.value = textNode.value.replace(/\\\|/g, '|');
					}
				}
			}

			if (isElement) {
				const el = node as Element;
				if (
					el.tagName === 'code' &&
					Array.isArray(el.children) &&
					el.children.length === 1 &&
					el.children[0].type === 'text'
				) {
					const parentNode = ancestors[ancestors.length - 2];
					const isBlockCode = parentNode.tagName === 'pre';
					const insideTableCell = ancestors.some((ancestor) => {
						if (ancestor === el) return false;
						const a = ancestor;
						return a.tagName === 'td' || a.tagName === 'th';
					});

					const childText = el.children[0];
					let raw = typeof childText.value === 'string' ? childText.value : '';
					if (raw.includes('\\|')) {
						raw = raw.replace(/\\\|/g, '|');
						childText.value = raw;
					}

					if (!isBlockCode && insideTableCell && raw.includes('|') && parent) {
						const parentChildren = parent.children;
						if (Array.isArray(parentChildren)) {
							const segments = raw.split('|').map((segment: string) => segment.trim());
							if (segments.length > 1) {
								const replacements: ElementContent[] = segments.flatMap(
									(segment: string, segmentIndex: number) => {
										const codeNode: Element = {
											type: 'element',
											tagName: 'code',
											properties: el.properties,
											children: [
												{
													type: 'text',
													value: segment
												}
											]
										};

										if (segmentIndex === segments.length - 1) {
											return [codeNode];
										}

										return [codeNode, { type: 'text', value: ' ' }];
									}
								);

								parentChildren.splice(index, 1, ...replacements);
								ancestors.pop();
								replacements.forEach((child: Node, childIndex: number) => {
									visit(child, parent, index + childIndex);
								});
								return;
							}
						}
					}
				}
			}

			const childNodes = isElement || isRoot ? (node as Root | Element).children : [];
			for (let i = 0; i < childNodes.length; i += 1) {
				visit(childNodes[i], node as Root | Element, i);
			}

			if (isElement) {
				ancestors.pop();
			}
		};

		visit(tree);
	};
};

/**
 * Base path the site is served from: '' locally, '/svelte-pdf-mini' on GitHub
 * Pages (set by the deploy workflow through BASE_PATH).
 */
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

/**
 * Prefix root-absolute links in docs content (Markdown links and inline HTML)
 * with the base path, so pages keep writing `/docs/...`.
 */
type LinkNode = { type: string; properties?: Record<string, unknown>; value?: string; children?: LinkNode[] };
const rehypeBasePath = () => (tree: LinkNode) => {
	if (!base) return;
	const fix = (url: unknown) =>
		typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith(base + '/')
			? base + url
			: url;
	const visit = (node: LinkNode) => {
		if (node.type === 'element' && node.properties) {
			for (const key of ['href', 'src']) if (key in node.properties) node.properties[key] = fix(node.properties[key]);
		} else if (node.type === 'raw' && node.value) {
			// Inline HTML / Svelte markup in .svx pages.
			node.value = node.value.replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`);
		}
		node.children?.forEach(visit);
	};
	visit(tree);
};

const themes = {
	light: 'github-light',
	dark: 'github-dark'
};
const highlighter = await createHighlighter({
	themes: Object.values(themes),
	langs: ['svelte', 'bash', 'json', 'typescript', 'javascript', 'css', 'html', 'shellscript']
});

const markdownLayout = fileURLToPath(
	new URL('./src/lib/components/docs/MarkdownLayout.svelte', import.meta.url)
);


export default defineConfig({
	server: { port: 5173 },
	plugins: [
		tailwindcss(),
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [
				mdsvex({
					extensions: ['.svx'],
					layout: { _: markdownLayout },
					rehypePlugins: [tableCellFormatter, rehypeSlug, rehypeBasePath],
					highlight: {
						highlighter: (code: string, lang: string | null = 'text') => {
							const safeLang = lang ?? 'text';
							const lightHtml = escapeSvelte(highlighter.codeToHtml(code, { lang: safeLang, theme: themes.light, tabindex: false }));
							const darkHtml = escapeSvelte(highlighter.codeToHtml(code, { lang: safeLang, theme: themes.dark, tabindex: false }));
							return `<svelte:component this={Reflect.get(globalThis, "__MarkdownPre")} lang={${JSON.stringify(lang)}} htmlLight={${JSON.stringify(lightHtml)}} htmlDark={${JSON.stringify(darkHtml)}} raw={${JSON.stringify(code)}} />`;
						}
					}
				}),
				vitePreprocess()
			],
			compilerOptions: {
				// mdsvex pages compile in legacy mode ($$props); everything else uses runes.
				runes: ({ filename }) => (filename.endsWith('.svx') || filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ fallback: '404.html' }),
			paths: { base, relative: false },
		})
	],
	resolve: {
		alias: [
			{ find: /^svelte-pdf-mini\/styles\.css$/, replacement: `${lib}/styles.css` },
			{ find: /^svelte-pdf-mini\/(core|state)$/, replacement: `${lib}/$1/index.ts` },
			{ find: /^svelte-pdf-mini$/, replacement: `${lib}/index.ts` },
		]
	},
	optimizeDeps: { exclude: ['pdfjs-dist'] },
	worker: { format: 'es' }
});
