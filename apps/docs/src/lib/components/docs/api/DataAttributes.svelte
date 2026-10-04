<script lang="ts">
	import Table from '../markdown/Table.svelte';
	import Thead from '../markdown/Thead.svelte';
	import Tbody from '../markdown/Tbody.svelte';
	import Tr from '../markdown/Tr.svelte';
	import Th from '../markdown/Th.svelte';
	import Td from '../markdown/Td.svelte';
	import { apiNamespaces } from './types.ts';

	const rows = apiNamespaces.flatMap((ns) => ns.parts.filter((p) => p.dataAttributes.length).map((p) => ({ part: p.component, attrs: p.dataAttributes })));
</script>

<Table class="text-sm">
	<Thead><Tr><Th class="w-[28%]">Part</Th><Th>Data attributes</Th></Tr></Thead>
	<Tbody>
		{#each rows as r (r.part)}
			<Tr>
				<Td class="align-top"><code class="font-mono text-[13px] font-medium text-foreground">{r.part}</code></Td>
				<Td><span class="flex flex-wrap gap-1">{#each r.attrs as a (a)}<code class="rounded bg-background-inset px-1.5 py-0.5 font-mono text-[12px] text-foreground">{a}</code>{/each}</span></Td>
			</Tr>
		{/each}
	</Tbody>
</Table>
