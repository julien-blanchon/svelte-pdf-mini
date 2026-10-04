<script lang="ts">
	import { attachRef, mergeProps } from 'svelte-toolbelt';
	import type { EventHandler } from 'svelte/elements';
	import { DocumentContext } from '../../state/context.js';
	import { formatMessage } from '../../core/i18n/messages.js';
	import type { DocumentPasswordProps, PasswordReason } from './types.js';

	let { ref = $bindable(null), child, children, ...rest }: DocumentPasswordProps = $props();
	const doc = DocumentContext.get();
	const refAttachment = attachRef<HTMLFormElement>((node) => (ref = node));
	const submit = (password: string) => doc.submitPassword(password);
	const reason: PasswordReason = $derived(doc.passwordReason ?? 'need');

	/** Submits the form's password field (the default markup, or a `child` form that has one). */
	const onsubmit: EventHandler<SubmitEvent, HTMLFormElement> = (e) => {
		e.preventDefault();
		const input = e.currentTarget.querySelector<HTMLInputElement>('input[type=password]');
		if (input) submit(input.value);
	};

	const mergedProps = $derived(
		mergeProps(rest, {
			'data-pdf-password': '',
			'data-reason': reason,
			onsubmit,
			...refAttachment
		})
	);
</script>

{#if doc.status === 'password'}
	{#if child}
		{@render child({ props: mergedProps, reason, submit })}
	{:else}
		<form {...mergedProps}>
			{#if children}
				{@render children({ reason, submit })}
			{:else}
				<label>
					{formatMessage({}, reason === 'incorrect' ? 'passwordIncorrect' : 'passwordNeeded')}
					<input type="password" autocomplete="current-password" />
				</label>
				<button type="submit">{formatMessage({}, 'passwordOpen')}</button>
			{/if}
		</form>
	{/if}
{/if}
