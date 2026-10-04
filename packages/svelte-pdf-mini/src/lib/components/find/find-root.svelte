<script lang="ts">
	import { FindContext, ViewerContext } from '../../state/context.js';
	import { FindState } from '../../state/find.svelte.js';
	import { FIND_OPTIONS } from './options.js';
	import type { SearchOptions } from '../../core/text/search.js';
	import type { FindRootProps } from './types.js';

	let {
		query = $bindable(''),
		onQueryChange,
		caseSensitive,
		wholeWord,
		regex,
		diacritics,
		debounce,
		find = $bindable(),
		children
	}: FindRootProps = $props();

	const state = FindContext.set(
		new FindState({
			viewer: ViewerContext.get(),
			query: () => query,
			onQueryChange: (q) => {
				query = q;
				onQueryChange?.(q);
			},
			// Read once: the debounce is fixed for the lifetime of the state.
			// eslint-disable-next-line svelte/no-unused-svelte-ignore -- the compiler does warn here
			// svelte-ignore state_referenced_locally
			debounce
		})
	);
	find = state;

	// Option props, when given, drive the state (toggles also write the state directly).
	$effect(() => {
		const given: SearchOptions = { caseSensitive, wholeWord, regex, diacritics };
		for (const key of FIND_OPTIONS) if (given[key] !== undefined) state.options[key] = given[key];
	});
</script>

{@render children?.({ find: state })}
