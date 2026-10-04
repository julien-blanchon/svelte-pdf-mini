<script lang="ts">
	import Table from '../markdown/Table.svelte';
	import Thead from '../markdown/Thead.svelte';
	import Tbody from '../markdown/Tbody.svelte';
	import Tr from '../markdown/Tr.svelte';
	import Th from '../markdown/Th.svelte';
	import Td from '../markdown/Td.svelte';
	import { cssVariables } from './types.ts';

	let { prefix }: { prefix?: string } = $props();
	const vars = $derived(prefix ? cssVariables.filter((v) => v.name.startsWith(prefix)) : cssVariables);
</script>

<Table class="text-sm">
	<Thead><Tr><Th class="w-[40%]">Variable</Th><Th>Default</Th></Tr></Thead>
	<Tbody>
		{#each vars as v (v.name)}
			<Tr>
				<Td><code class="font-mono text-[13px] font-medium text-foreground">{v.name}</code></Td>
				<Td>{#if v.default}<code class="font-mono text-[12.5px] break-words text-foreground">{v.default}</code>{:else}<span class="text-foreground-muted">set inline / no fallback</span>{/if}</Td>
			</Tr>
		{/each}
	</Tbody>
</Table>
