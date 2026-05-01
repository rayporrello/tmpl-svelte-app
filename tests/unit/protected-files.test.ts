import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	INIT_SITE_OWNED_FILES,
	PROTECTED_FILES,
	isAllowed,
	normalizeRepoPath,
} from '../../scripts/lib/protected-files';

describe('protected file allowlist', () => {
	it('allows bootstrap-owned and init-site-owned paths', () => {
		expect(isAllowed('.env')).toBe(true);
		expect(isAllowed('src/lib/config/site.ts')).toBe(true);
		expect(isAllowed('src/app.html')).toBe(false);
	});

	it('normalizes absolute paths relative to the repo root', () => {
		const absolute = join(process.cwd(), 'static/admin/config.yml');
		expect(normalizeRepoPath(absolute)).toBe('static/admin/config.yml');
		expect(isAllowed(absolute)).toBe(true);
	});

	it('exports the init-site-owned subset', () => {
		expect(PROTECTED_FILES).toContain('.bootstrap.state.json');
		expect(INIT_SITE_OWNED_FILES).not.toContain('.bootstrap.state.json');
		expect(INIT_SITE_OWNED_FILES).toContain('README.md');
	});
});
