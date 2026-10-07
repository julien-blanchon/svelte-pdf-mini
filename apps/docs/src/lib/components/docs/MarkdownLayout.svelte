<script module lang="ts">
	// mdsvex replaces each Markdown element with the component exported under its tag name.
	import MarkdownPre from './markdown/MarkdownPre.svelte';
	import Blockquote from './markdown/Blockquote.svelte';
	import Code from './markdown/Code.svelte';
	import Divider from './markdown/Divider.svelte';
	import H1 from './markdown/H1.svelte';
	import H2 from './markdown/H2.svelte';
	import H3 from './markdown/H3.svelte';
	import H4 from './markdown/H4.svelte';
	import Link from './markdown/Link.svelte';
	import ListItem from './markdown/ListItem.svelte';
	import OrderedList from './markdown/OrderedList.svelte';
	import Paragraph from './markdown/Paragraph.svelte';
	import Pre from './markdown/Pre.svelte';
	import Strong from './markdown/Strong.svelte';
	import Table from './markdown/Table.svelte';
	import Tbody from './markdown/Tbody.svelte';
	import Td from './markdown/Td.svelte';
	import Th from './markdown/Th.svelte';
	import Thead from './markdown/Thead.svelte';
	import Tr from './markdown/Tr.svelte';
	import UnorderedList from './markdown/UnorderedList.svelte';
	import Steps from './markdown/Steps.svelte';
	import Step from './markdown/Step.svelte';

	Reflect.set(globalThis, '__MarkdownPre', MarkdownPre);

	export {
		Blockquote as blockquote,
		Code as code,
		Divider as hr,
		H1 as h1,
		H2 as h2,
		H3 as h3,
		H4 as h4,
		Link as a,
		ListItem as li,
		OrderedList as ol,
		Paragraph as p,
		Pre as pre,
		Strong as strong,
		MarkdownPre,
		Table as table,
		Tbody as tbody,
		Td as td,
		Th as th,
		Thead as thead,
		Tr as tr,
		UnorderedList as ul,
		Steps,
		Step
	};
</script>

<script lang="ts">
	import { type Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<article
	data-doc-content
	class="w-full max-w-4xl space-y-6 has-[[data-demo-wide]]:max-w-none text-base leading-relaxed text-foreground"
>
	{#if children}
		{@render children()}
	{/if}
</article>
