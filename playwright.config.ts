import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '45139';
const managedOrigin = `http://127.0.0.1:${port}`;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? managedOrigin;
const shouldBuildManagedServer = process.env.PLAYWRIGHT_SKIP_BUILD !== '1';
const stubDatabaseUrl = 'postgres://ci_stub:ci_stub@127.0.0.1:5432/ci_stub';

/**
 * Playwright e2e configuration.
 * Tests run against the built server (bun build/index.js), not the dev server.
 * The managed webServer command builds the production bundle before booting it
 * so standalone `bun run test:e2e` works on a fresh clone.
 *
 * Set PLAYWRIGHT_BASE_URL to target an already-running/deployed server. In that
 * mode Playwright does not start a local webServer.
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	...(externalBaseUrl
		? {}
		: {
				webServer: {
					command: `${shouldBuildManagedServer ? 'bun run build && ' : ''}bun build/index.js`,
					url: `${managedOrigin}/healthz`,
					reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
					timeout: 60_000,
					env: {
						PORT: port,
						HOST: '127.0.0.1',
						ORIGIN: managedOrigin,
						PUBLIC_SITE_URL: managedOrigin,
						// Stub: lets initEnv() pass without a live DB. Default e2e never probes /readyz.
						DATABASE_URL: process.env.PLAYWRIGHT_DATABASE_URL ?? stubDatabaseUrl,
					},
				},
			}),
});
