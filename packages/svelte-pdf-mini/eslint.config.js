import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'], parser: ts.parser }
		}
	},
	{
		rules: {
			// Chained ternaries are hard to read: use a lookup table, early returns or a switch.
			'no-nested-ternary': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			// False positive on bindable props (`ref = $bindable(null)` is read by the parent).
			'no-useless-assignment': 'off',
			// Caches and indexes here are deliberately non-reactive plain Map / Set.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{ ignores: ['dist/', '.svelte-kit/', 'build/'] }
);
