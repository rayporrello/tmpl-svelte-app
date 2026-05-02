import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runSeedDev, type SeedDatabase } from '../../scripts/seed-dev';

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

function tempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), 'seed-dev-'));
	tempDirs.push(dir);
	writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://seed:secret@127.0.0.1:5432/seed\n');
	return dir;
}

function fakeDb(): SeedDatabase {
	return {
		insertContactSubmissions: vi.fn(async () => undefined),
		deleteContactSubmissions: vi.fn(async () => undefined),
	};
}

function collectFiles(rootDir: string, dir: string): Record<string, string> {
	const absoluteDir = join(rootDir, dir);
	if (!existsSync(absoluteDir)) return {};
	const output: Record<string, string> = {};
	for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) Object.assign(output, collectFiles(rootDir, path));
		else output[path] = readFileSync(join(rootDir, path), 'utf8');
	}
	return output;
}

describe('seed:dev', () => {
	it('creates deterministic content and contact submission rows', async () => {
		const rootDir = tempProject();
		const db = fakeDb();

		const first = await runSeedDev({ rootDir, db });
		const snapshot = {
			articles: collectFiles(rootDir, 'content/articles'),
			team: collectFiles(rootDir, 'content/team'),
			testimonials: collectFiles(rootDir, 'content/testimonials'),
		};
		const second = await runSeedDev({ rootDir, db });
		const secondSnapshot = {
			articles: collectFiles(rootDir, 'content/articles'),
			team: collectFiles(rootDir, 'content/team'),
			testimonials: collectFiles(rootDir, 'content/testimonials'),
		};

		expect(first.exitCode).toBe(0);
		expect(second.exitCode).toBe(0);
		expect(secondSnapshot).toEqual(snapshot);
		expect(Object.keys(snapshot.articles)).toHaveLength(3);
		expect(Object.keys(snapshot.team)).toHaveLength(2);
		expect(Object.keys(snapshot.testimonials)).toHaveLength(2);
		expect(db.insertContactSubmissions).toHaveBeenCalledTimes(2);
		expect(db.insertContactSubmissions).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					id: '11111111-1111-4111-8111-111111111111',
					email: 'priya.seed@example.com',
				}),
			])
		);
	});

	it('reset removes only deterministic seed files and seeded DB rows', async () => {
		const rootDir = tempProject();
		const db = fakeDb();
		await runSeedDev({ rootDir, db });
		writeFileSync(join(rootDir, 'content/articles/real-article.md'), 'real content\n');

		const result = await runSeedDev({ rootDir, db, reset: true });

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(rootDir, 'content/articles/seed-launch-checklist.md'))).toBe(false);
		expect(readFileSync(join(rootDir, 'content/articles/real-article.md'), 'utf8')).toBe(
			'real content\n'
		);
		expect(db.deleteContactSubmissions).toHaveBeenCalledWith(
			expect.arrayContaining(['55555555-5555-4555-8555-555555555555'])
		);
	});

	it('fails without DATABASE_URL or an injected database client', async () => {
		const rootDir = mkdtempSync(join(tmpdir(), 'seed-dev-no-db-'));
		tempDirs.push(rootDir);

		const result = await runSeedDev({ rootDir, env: {} });

		expect(result).toMatchObject({
			exitCode: 1,
			messages: [expect.stringContaining('DATABASE_URL')],
		});
		expect(existsSync(join(rootDir, 'content/articles/seed-launch-checklist.md'))).toBe(false);
	});
});
