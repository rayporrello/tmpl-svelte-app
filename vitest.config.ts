import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
		// Resolve $lib/* path alias (matches .svelte-kit/tsconfig.json alias).
		// SvelteKit virtual modules ($env/*, $app/*) are not available in unit tests.
		// Tests that need them must mock via vi.mock() or test the underlying logic directly.
		alias: {
			$lib: resolve('./src/lib'),
		},
	},
});
