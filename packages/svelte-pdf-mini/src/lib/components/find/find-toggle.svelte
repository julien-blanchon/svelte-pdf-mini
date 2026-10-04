<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { MessageKey } from '../../core/i18n/messages.js';
	import { FindContext } from '../../state/context.js';
	import { dataAttr } from '../../internal/types.js';
	import { FIND_OPTION_GLYPHS, type FindOption } from './options.js';
	import type { FindToggleProps } from './types.js';

	const LABEL_KEYS: Record<FindOption, MessageKey> = {
		caseSensitive: 'matchCase',
		wholeWord: 'wholeWords',
		regex: 'regex',
		diacritics: 'matchAccents'
	};

	let { option, ref = $bindable(null), child, children, ...rest }: FindToggleProps = $props();
	const find = FindContext.get();
	const refAttachment = attachRef<HTMLButtonElement>((node) => (ref = node));
	const label = $derived(find.viewer.t(LABEL_KEYS[option]));
	const pressed = $derived(!!find.options[option]);
	const mergedProps = $derived(
		mergeProps(rest, {
			type: 'button' as const,
			'data-pdf-find-toggle': option,
			'data-active': dataAttr(pressed),
			'aria-pressed': pressed,
			'aria-label': label,
			title: label,
			onclick: () => (find.options[option] = !pressed),
			...refAttachment
		})
	);
</script>

{#if child}
	{@render child({ props: mergedProps, pressed })}
{:else}
	<button {...mergedProps}
		>{#if children}{@render children({ pressed })}{:else}{FIND_OPTION_GLYPHS[option]}{/if}</button
	>
{/if}
