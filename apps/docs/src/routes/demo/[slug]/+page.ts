import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import type { ExampleMeta } from '#lib/demos/examples/registry.ts';
import type { EntryGenerator, PageLoad } from './$types';

const demos = import.meta.glob<{ default: Component; meta: ExampleMeta }>(
	'/src/lib/demos/examples/*/Example.svelte'
);
const slugOf = (path: string) => path.split('/').at(-2)!;

export const prerender = true;
export const entries: EntryGenerator = () => Object.keys(demos).map((p) => ({ slug: slugOf(p) }));

export const load: PageLoad = async ({ params }) => {
	const load = demos[`/src/lib/demos/examples/${params.slug}/Example.svelte`];
	if (!load) error(404, 'Demo not found');
	const mod = await load();
	return { slug: params.slug, component: mod.default, title: mod.meta.title };
};
