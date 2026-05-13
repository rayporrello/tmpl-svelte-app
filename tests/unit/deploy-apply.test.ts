import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../scripts/deploy-apply';

describe('deploy:apply CLI arguments', () => {
	it('parses the explicit migration gate skip flag', () => {
		expect(
			parseArgs([
				'--image=ghcr.io/example/site:sha-abc123',
				'--sha=abc123',
				'--safety=rollback-safe',
				'--skip-migration-gate',
				'--dry-run',
			])
		).toMatchObject({
			image: 'ghcr.io/example/site:sha-abc123',
			sha: 'abc123',
			safety: 'rollback-safe',
			skipMigrationGate: true,
			dryRun: true,
		});
	});
});
