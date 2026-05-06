import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseQuadletImage, replaceQuadletImage } from '../../scripts/lib/quadlet-image';

let tempDir: string;

function writeQuadlet(content: string): string {
	const path = join(tempDir, 'web.container');
	writeFileSync(path, content);
	return path;
}

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), 'quadlet-image-'));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe('quadlet image helpers', () => {
	it('parses the single Image ref under [Container]', () => {
		const path = writeQuadlet(
			'[Unit]\nImage=ignored\n\n[Container]\nImage=ghcr.io/acme/site:sha-1\n'
		);

		expect(parseQuadletImage(path)).toEqual({
			imageRef: 'ghcr.io/acme/site:sha-1',
			lineNumber: 5,
			raw: 'Image=ghcr.io/acme/site:sha-1',
		});
	});

	it('rejects multiple Image lines under [Container]', () => {
		const path = writeQuadlet('[Container]\nImage=one\nImage=two\n');

		expect(() => parseQuadletImage(path)).toThrow(/multiple Image= lines/u);
	});

	it('rejects a file without a [Container] section', () => {
		const path = writeQuadlet('[Unit]\nDescription=Example\n');

		expect(() => parseQuadletImage(path)).toThrow(/no \[Container\] section/u);
	});

	it('rejects a [Container] section without Image', () => {
		const path = writeQuadlet('[Container]\nPull=never\n');

		expect(() => parseQuadletImage(path)).toThrow(/no Image= line/u);
	});

	it('replaces Image while preserving blank lines, comments, and ordering', () => {
		const path = writeQuadlet(
			[
				'[Unit]',
				'Description=Example',
				'',
				'[Container]',
				'# pinned image',
				'Image=ghcr.io/acme/site:sha-old',
				'Pull=never',
				'',
				'[Service]',
				'Restart=on-failure',
				'',
			].join('\n')
		);

		expect(replaceQuadletImage(path, 'ghcr.io/acme/site:sha-new')).toEqual({
			changed: true,
			oldRef: 'ghcr.io/acme/site:sha-old',
		});
		expect(readFileSync(path, 'utf8')).toBe(
			[
				'[Unit]',
				'Description=Example',
				'',
				'[Container]',
				'# pinned image',
				'Image=ghcr.io/acme/site:sha-new',
				'Pull=never',
				'',
				'[Service]',
				'Restart=on-failure',
				'',
			].join('\n')
		);
	});

	it('reports dry-run changes without writing to disk', () => {
		const original = '[Container]\nImage=ghcr.io/acme/site:sha-old\nPull=never\n';
		const path = writeQuadlet(original);

		expect(replaceQuadletImage(path, 'ghcr.io/acme/site:sha-new', { dryRun: true })).toEqual({
			changed: true,
			oldRef: 'ghcr.io/acme/site:sha-old',
		});
		expect(readFileSync(path, 'utf8')).toBe(original);
	});
});
