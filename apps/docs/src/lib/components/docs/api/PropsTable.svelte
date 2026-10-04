<script lang="ts">
	import Table from '../markdown/Table.svelte';
	import Thead from '../markdown/Thead.svelte';
	import Tbody from '../markdown/Tbody.svelte';
	import Tr from '../markdown/Tr.svelte';
	import Th from '../markdown/Th.svelte';
	import Td from '../markdown/Td.svelte';
	import type { ApiProp } from './types.ts';

	let { props, kind = 'prop' }: { props: ApiProp[]; kind?: 'prop' | 'snippet' } = $props();
</script>

<Table class="text-sm">
	<Thead>
		<Tr>
			<Th class="w-[32%]">{kind === 'prop' ? 'Prop' : 'Snippet prop'}</Th>
			<Th>Type</Th>
			{#if kind === 'prop'}<Th class="w-[16%]">Default</Th>{/if}
		</Tr>
	</Thead>
	<Tbody>
		{#each props as p (p.name)}
			<Tr>
				<Td class="align-top">
					<span class="flex flex-wrap items-center gap-1.5">
						<code class="rounded bg-background-inset px-1.5 py-0.5 font-mono text-[13px] font-medium text-foreground">{p.name}</code>
						{#if p.required && kind === 'prop'}<span class="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">required</span>{/if}
						{#if p.bindable}<span class="rounded bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-accent" title="Supports bind:">bindable</span>{/if}
					</span>
					{#if p.description}<span class="mt-1.5 block text-[13px] leading-snug text-foreground-muted">{p.description}</span>{/if}
				</Td>
				<Td class="align-top"><code class="font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground">{p.type}</code></Td>
				{#if kind === 'prop'}
					<Td class="align-top">{#if p.default}<code class="font-mono text-[12.5px] break-words text-foreground">{p.default}</code>{:else}<span class="text-foreground-muted">—</span>{/if}</Td>
				{/if}
			</Tr>
		{/each}
	</Tbody>
</Table>
