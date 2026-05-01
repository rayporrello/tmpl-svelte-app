import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { mergeEnv, parseEnv, readEnv, serializeEnv, writeEnv } from '../../scripts/lib/env-file';
import { BootstrapScriptError } from '../../scripts/lib/errors';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempPath(file: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'env-file-'));
	tempDirs.push(dir);
	return join(dir, file);
}

describe('env-file helper', () => {
	it('parses dotenv comments, export prefix, and quoted values', () => {
		expect(
			parseEnv(`
# comment
export ORIGIN=https://example.com # inline
NAME='Jane Doe'
MULTILINE="one\\ntwo"
EMPTY=
`)
		).toEqual({
			ORIGIN: 'https://example.com',
			NAME: 'Jane Doe',
			MULTILINE: 'one\ntwo',
			EMPTY: '',
		});
	});

	it('throws BOOT-ENV-001 for malformed lines', () => {
		expect(() => parseEnv('DATABASE_URL\n')).toThrow(BootstrapScriptError);
		try {
			parseEnv('DATABASE_URL\n');
		} catch (error) {
			expect((error as BootstrapScriptError).code).toBe('BOOT-ENV-001');
		}
	});

	it('reads missing env files as an empty object and writes deterministic output', () => {
		const path = tempPath('.env');
		expect(readEnv(path)).toEqual({});

		writeEnv(path, { A: 'plain', B: 'two words', C: 'line\nbreak' });
		expect(readEnv(path)).toEqual({ A: 'plain', B: 'two words', C: 'line\nbreak' });
		expect(readFileSync(path, 'utf8')).toBe('A=plain\nB="two words"\nC="line\\nbreak"\n');
	});

	it('merges additions without overwriting existing keys', () => {
		expect(
			mergeEnv({ DATABASE_URL: 'existing' }, { DATABASE_URL: 'new', ORIGIN: 'local' })
		).toEqual({
			DATABASE_URL: 'existing',
			ORIGIN: 'local',
		});
	});

	it('serializes empty values with quotes', () => {
		expect(serializeEnv({ EMPTY: '' })).toBe('EMPTY=""\n');
	});
});
