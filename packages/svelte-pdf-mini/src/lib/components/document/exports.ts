export { default as Root } from './document-root.svelte';
export { default as Loading } from './document-loading.svelte';
export { default as Error } from './document-error.svelte';
export { default as Password } from './document-password.svelte';
export type {
	DocumentRootProps as RootProps,
	DocumentRootSnippetProps as RootSnippetProps,
	DocumentLoadingProps as LoadingProps,
	DocumentErrorProps as ErrorProps,
	DocumentPasswordProps as PasswordProps,
	PasswordReason
} from './types.js';
