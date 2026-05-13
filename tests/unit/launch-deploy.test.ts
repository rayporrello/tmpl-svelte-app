import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../scripts/launch-deploy';

describe('launch:deploy CLI arguments', () => {
	it('separates launch gate flags from deploy:apply flags', () => {
		expect(
			parseArgs(
				[
					'--client=acme',
					'--web-data-platform=../platform',
					'--image=ghcr.io/example/site:sha-abc123',
					'--sha=abc123',
					'--safety=rollback-safe',
					'--dry-run',
				],
				{},
				'/work/site'
			)
		).toMatchObject({
			client: 'acme',
			webDataPlatformPath: '/work/platform',
			skipChecklist: false,
			deployArgs: [
				'--image=ghcr.io/example/site:sha-abc123',
				'--sha=abc123',
				'--safety=rollback-safe',
				'--dry-run',
			],
		});
	});
});
