<!-- The annotation keymap, read live from the library (so it never drifts). -->
<script lang="ts">
	import { defaultKeymap } from 'svelte-pdf-mini';
	import Table from './markdown/Table.svelte';
	import Thead from './markdown/Thead.svelte';
	import Tbody from './markdown/Tbody.svelte';
	import Tr from './markdown/Tr.svelte';
	import Th from './markdown/Th.svelte';
	import Td from './markdown/Td.svelte';

	const describe: Record<string, string> = {
		confirm: 'Keep the annotation just created',
		cancel: 'Discard the annotation just created; otherwise deselect and return to select',
		delete: 'Delete the selected annotations',
		edit: 'Edit the selected annotation’s note',
		undo: 'Undo',
		redo: 'Redo'
	};
	const label = (action: string) => {
		if (describe[action]) return describe[action];
		const [group, name] = action.split('.');
		if (group === 'tool') return `${name[0].toUpperCase()}${name.slice(1)} tool`;
		if (group === 'markup') return name === 'comment' ? 'With text selected: highlight and comment' : `With text selected: ${name}`;
		if (group === 'color') return `Colour ${name} (selection, pending annotation or next one)`;
		if (group === 'nudge') return `Nudge the selected shape ${name} (Shift ×10)`;
		return action;
	};
	/** Platform-neutral key names (the page is prerendered, so no ⌘ vs Ctrl guess). */
	const KEY_LABELS: Record<string, string> = { mod: 'Ctrl/⌘', shift: 'Shift', alt: 'Alt', ' ': 'Space' };
	const keyLabel = (key: string) => KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
	const pretty = (combo: string) => combo.split('+').map(keyLabel).join(' + ');
	const rows = Object.entries(defaultKeymap as Record<string, string[]>);
</script>

<Table class="text-sm">
	<Thead><Tr><Th class="w-[26%]">Action</Th><Th class="w-[30%]">Keys</Th><Th>Does</Th></Tr></Thead>
	<Tbody>
		{#each rows as [action, combos] (action)}
			<Tr>
				<Td><code class="font-mono text-[12.5px] text-foreground">{action}</code></Td>
				<Td><span class="flex flex-wrap gap-1">{#each combos as c (c)}<kbd class="rounded border border-background-muted bg-background-inset px-1.5 py-0.5 font-mono text-[12px] text-foreground">{pretty(c)}</kbd>{/each}</span></Td>
				<Td>{label(action)}</Td>
			</Tr>
		{/each}
	</Tbody>
</Table>
