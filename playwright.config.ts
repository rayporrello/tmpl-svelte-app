import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '3000';
const origin = `http://127.0.0.1:${port}`;

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
		baseURL: origin,
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
		url: `${origin}/healthz`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		env: {
			PORT: port,
			HOST: '127.0.0.1',
			ORIGIN: origin,
			PUBLIC_SITE_URL: origin,
			// Stub: lets initEnv() pass without a live DB. No queries run in e2e tests.
			DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://ci_stub:ci_stub@127.0.0.1:5432/ci_stub',
		},
	},
});
