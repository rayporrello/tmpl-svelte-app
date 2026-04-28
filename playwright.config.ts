import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration.
 * Tests run against the built server (bun build/index.js), not the dev server.
 * The validate script runs `bun run build` before `bun run test:e2e`, so the
 * build artifact always exists when Playwright starts.
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'bun build/index.js',
		url: 'http://127.0.0.1:3000/healthz',
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		env: {
			PORT: '3000',
			HOST: '127.0.0.1',
			ORIGIN: 'http://127.0.0.1:3000',
			PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
			// Stub: lets initEnv() pass without a live DB. No queries run in e2e tests.
			DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://ci_stub:ci_stub@127.0.0.1:5432/ci_stub',
		},
	},
});
