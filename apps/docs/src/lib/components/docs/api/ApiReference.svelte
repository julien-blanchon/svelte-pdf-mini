<!--
	API tables generated from the library's TypeScript types (scripts/generate-api.ts).
	Renders top-level headings so they appear in "On this page".
-->
<script lang="ts">
	import H3 from '../markdown/H3.svelte';
	import Paragraph from '../markdown/Paragraph.svelte';
	import PropsTable from './PropsTable.svelte';
	import { getNamespace, slugOf } from './types.ts';

	let { namespace, parts }: { namespace: string; parts?: string[] } = $props();
	const ns = $derived(getNamespace(namespace));
	/** The namespace's parts, optionally narrowed to `parts`. */
	const shown = $derived.by(() => {
		if (!ns) return [];
		return parts ? ns.parts.filter((p) => parts.includes(p.name)) : ns.parts;
	});
</script>

{#each shown as part (part.component)}
	<H3 id={slugOf(part.component)}><code>{part.component}</code></H3>
	<Paragraph>
		{#if part.description}{part.description} {/if}
		{#if part.element}Renders a <code class="font-mono text-sm text-foreground">&lt;{part.element}&gt;</code> (or your element via <code class="font-mono text-sm text-foreground">child</code>) and accepts its HTML attributes.{:else}A provider: renders no element of its own.{/if}
	</Paragraph>
	{#if part.props.length}
		<PropsTable props={part.props} />
	{:else if part.element}
		<Paragraph>No props of its own besides <code class="font-mono text-sm text-foreground">ref</code>, <code class="font-mono text-sm text-foreground">child</code> and <code class="font-mono text-sm text-foreground">children</code>.</Paragraph>
	{/if}
	{#if part.snippetProps.length}
		<PropsTable props={part.snippetProps} kind="snippet" />
	{/if}
	{#if part.dataAttributes.length}
		<div class="mt-2 mb-6 flex flex-wrap items-center gap-1.5 text-sm text-foreground-muted">
			<span class="mr-1">Data attributes</span>
			{#each part.dataAttributes as a (a)}
				<code class="rounded border border-background-muted bg-background-inset px-1.5 py-0.5 font-mono text-[12px] text-foreground">{a}</code>
			{/each}
		</div>
	{/if}
{:else}
	<Paragraph>No API entries found for <code>{namespace}</code>.</Paragraph>
{/each}
