import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	allowedExtensionsFromEnv,
	findCreateExtensionViolations,
} from '../../scripts/lib/migration-sql-guard';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

function tempProject(sql: string): string {
	const root = mkdtempSync(join(tmpdir(), 'migration-sql-guard-'));
	tempDirs.push(root);
	mkdirSync(join(root, 'drizzle'), { recursive: true });
	writeFileSync(join(root, 'drizzle/0001_extension.sql'), sql);
	return root;
}

describe('migration SQL guard', () => {
	it('flags unauthorized CREATE EXTENSION statements', () => {
		const root = tempProject('create extension if not exists "pgcrypto";\n');

		expect(findCreateExtensionViolations(root)).toEqual([
			{ file: 'drizzle/0001_extension.sql', line: 1, extension: 'pgcrypto' },
		]);
	});

	it('ignores comments and explicitly allowed extensions', () => {
		const root = tempProject(
			[
				'-- create extension hstore;',
				'/* create extension vector; */',
				'create extension if not exists pgcrypto;',
			].join('\n')
		);

		expect(findCreateExtensionViolations(root, new Set(['pgcrypto']))).toEqual([]);
		expect(allowedExtensionsFromEnv('pgcrypto, vector')).toEqual(new Set(['pgcrypto', 'vector']));
	});
});
