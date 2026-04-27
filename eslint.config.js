import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser },
		},
	},
	{
		rules: {
			// Plain <a href> links are not programmatic navigation — rule produces false positives
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		files: ['src/routes/styleguide/**'],
		rules: {
			// Styleguide shows code examples using {'{'}...{'}'} to escape curly braces in
			// Svelte template text — these are necessary, not useless
			'svelte/no-useless-mustaches': 'off',
		},
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'static/'],
	}
);
