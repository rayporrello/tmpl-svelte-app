#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { readEnv } from './lib/env-file';

export type SeedDevOptions = {
	rootDir?: string;
	env?: NodeJS.ProcessEnv;
	reset?: boolean;
	db?: SeedDatabase;
	stdout?: Pick<NodeJS.WriteStream, 'write'>;
	stderr?: Pick<NodeJS.WriteStream, 'write'>;
};

export type SeedDevResult = {
	exitCode: number;
	messages: string[];
};

export type SeedContactSubmission = {
	id: string;
	createdAt: string;
	name: string;
	email: string;
	message: string;
	sourcePath: string;
	userAgent: string;
	requestId: string;
};

export type SeedDatabase = {
	insertContactSubmissions: (rows: readonly SeedContactSubmission[]) => Promise<void>;
	deleteContactSubmissions: (ids: readonly string[]) => Promise<void>;
};

type SeedFile = {
	path: string;
	content: string | Buffer;
};

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEED_IMAGE = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
	'base64'
);

const ARTICLE_FILES: SeedFile[] = [
	{
		path: 'content/articles/seed-launch-checklist.md',
		content: `---
title: Launch Checklist for a Small Website
slug: seed-launch-checklist
description: A practical launch checklist for teams turning a fresh template into a production website.
date: '2026-04-10'
draft: false
image: /uploads/seed/seed-feature-01.png
image_alt: A tidy desk with a launch checklist beside a laptop
og_image: /uploads/seed/seed-feature-01.png
og_image_alt: A tidy desk with a launch checklist beside a laptop
---

Launching a small website is easier when the checklist is visible, specific, and owned by the team.

## Start With The Basics

Confirm the production domain, analytics consent state, contact-form routing, and platform handoff before the first public deploy.

## Keep The Review Human

Run the automated launch checks, then do one manual pass through the most important pages on desktop and mobile.
`,
	},
	{
		path: 'content/articles/seed-content-workflow.md',
		content: `---
title: Designing a Calm Content Workflow
slug: seed-content-workflow
description: How a file-backed CMS workflow keeps content updates reviewable and easy to roll back.
date: '2026-04-17'
draft: false
image: /uploads/seed/seed-feature-02.png
image_alt: Editorial notes arranged beside a content calendar
og_image: /uploads/seed/seed-feature-02.png
og_image_alt: Editorial notes arranged beside a content calendar
---

A calm content workflow gives editors enough structure to move quickly without hiding important changes from review.

## Make Drafts Cheap

Keep article drafts visible in Git, use preview deploys for review, and publish only when the page has a clear owner.

## Preserve The Trail

Small commits with descriptive messages make it possible to understand what changed long after launch week is over.
`,
	},
	{
		path: 'content/articles/seed-measurement-plan.md',
		content: `---
title: A Measurement Plan That Respects Privacy
slug: seed-measurement-plan
description: A lightweight approach to analytics that measures important actions without collecting personal data.
date: '2026-04-24'
draft: false
image: /uploads/seed/seed-feature-03.png
image_alt: A simple analytics dashboard with privacy notes
og_image: /uploads/seed/seed-feature-03.png
og_image_alt: A simple analytics dashboard with privacy notes
---

Useful analytics should explain whether the site is helping people complete meaningful actions.

## Track Intentional Events

Start with form submissions, outbound links, and important calls to action. Skip noisy click tracking until there is a real question to answer.

## Keep Personal Data Out

Names, email addresses, and message bodies belong in operational systems, not analytics events.
`,
	},
];

const TEAM_FILES: SeedFile[] = [
	{
		path: 'content/team/seed-mara-chen.yml',
		content: `name: Mara Chen
slug: seed-mara-chen
role: Strategy Lead
photo: ''
photo_alt: ''
bio: Mara helps teams turn broad goals into practical launch plans, content systems, and measurable next steps.
email: ''
order: 101
active: true
`,
	},
	{
		path: 'content/team/seed-owen-patel.yml',
		content: `name: Owen Patel
slug: seed-owen-patel
role: Design Systems Engineer
photo: ''
photo_alt: ''
bio: Owen keeps the visual system consistent, accessible, and ready for teams who need to move quickly.
email: ''
order: 102
active: true
`,
	},
];

const TESTIMONIAL_FILES: SeedFile[] = [
	{
		path: 'content/testimonials/seed-riley-stone.yml',
		content: `name: Riley Stone
slug: seed-riley-stone
quote: The starter content made it much easier to judge spacing, hierarchy, and calls to action before our real copy was ready.
source: Founder at Northstar Studio
rating: 5
photo: ''
photo_alt: ''
order: 101
published: true
`,
	},
	{
		path: 'content/testimonials/seed-sam-ortiz.yml',
		content: `name: Sam Ortiz
slug: seed-sam-ortiz
quote: We could style against realistic density on day one, then remove the seed data cleanly when the real content arrived.
source: Marketing Lead at Signal Works
rating: 5
photo: ''
photo_alt: ''
order: 102
published: true
`,
	},
];

const IMAGE_FILES: SeedFile[] = [
	{ path: 'static/uploads/seed/seed-feature-01.png', content: SEED_IMAGE },
	{ path: 'static/uploads/seed/seed-feature-02.png', content: SEED_IMAGE },
	{ path: 'static/uploads/seed/seed-feature-03.png', content: SEED_IMAGE },
];

const SEED_FILES = [...ARTICLE_FILES, ...TEAM_FILES, ...TESTIMONIAL_FILES, ...IMAGE_FILES];

const CONTACT_ROWS: SeedContactSubmission[] = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		createdAt: '2026-04-21T14:00:00.000Z',
		name: 'Priya Shah',
		email: 'priya.seed@example.com',
		message:
			'We are planning a launch next month and would like to talk through the site structure.',
		sourcePath: '/contact',
		userAgent: 'seed-dev',
		requestId: 'seed-dev-001',
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		createdAt: '2026-04-22T15:30:00.000Z',
		name: 'Marcus Lee',
		email: 'marcus.seed@example.com',
		message: 'Could you send more detail about the content migration process?',
		sourcePath: '/contact',
		userAgent: 'seed-dev',
		requestId: 'seed-dev-002',
	},
	{
		id: '33333333-3333-4333-8333-333333333333',
		createdAt: '2026-04-23T16:45:00.000Z',
		name: 'Elena Brooks',
		email: 'elena.seed@example.com',
		message: 'We need a privacy-conscious measurement plan for a new campaign site.',
		sourcePath: '/contact',
		userAgent: 'seed-dev',
		requestId: 'seed-dev-003',
	},
	{
		id: '44444444-4444-4444-8444-444444444444',
		createdAt: '2026-04-24T17:15:00.000Z',
		name: 'Jon Bell',
		email: 'jon.seed@example.com',
		message: 'Can the CMS workflow support editorial review before publishing?',
		sourcePath: '/contact',
		userAgent: 'seed-dev',
		requestId: 'seed-dev-004',
	},
	{
		id: '55555555-5555-4555-8555-555555555555',
		createdAt: '2026-04-25T18:20:00.000Z',
		name: 'Avery Morgan',
		email: 'avery.seed@example.com',
		message: 'We want to verify platform operations and launch checks before going live.',
		sourcePath: '/contact',
		userAgent: 'seed-dev',
		requestId: 'seed-dev-005',
	},
];

function parseArgs(argv: readonly string[]): Pick<SeedDevOptions, 'reset'> {
	const options = { reset: false };
	for (const arg of argv) {
		if (arg === '--reset') options.reset = true;
		else if (arg === '--help' || arg === '-h') {
			process.stdout.write('Usage: bun run seed:dev [-- --reset]\n');
			process.exit(0);
		} else {
			throw new Error(`Unknown seed:dev option: ${arg}`);
		}
	}
	return options;
}

function databaseUrlFrom(rootDir: string, env: NodeJS.ProcessEnv): string | null {
	if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
	const envPath = join(rootDir, '.env');
	if (!existsSync(envPath)) return null;
	return readEnv(envPath).DATABASE_URL?.trim() || null;
}

function defaultDatabase(databaseUrl: string): SeedDatabase {
	return {
		async insertContactSubmissions(rows) {
			const client = postgres(databaseUrl, { max: 1, idle_timeout: 1, connect_timeout: 5 });
			try {
				for (const row of rows) {
					await client`
						INSERT INTO contact_submissions (
							id,
							created_at,
							name,
							email,
							message,
							source_path,
							user_agent,
							request_id
						)
						VALUES (
							${row.id},
							${row.createdAt},
							${row.name},
							${row.email},
							${row.message},
							${row.sourcePath},
							${row.userAgent},
							${row.requestId}
						)
						ON CONFLICT (id) DO UPDATE SET
							created_at = EXCLUDED.created_at,
							name = EXCLUDED.name,
							email = EXCLUDED.email,
							message = EXCLUDED.message,
							source_path = EXCLUDED.source_path,
							user_agent = EXCLUDED.user_agent,
							request_id = EXCLUDED.request_id
					`;
				}
			} finally {
				await client.end({ timeout: 1 });
			}
		},
		async deleteContactSubmissions(ids) {
			const client = postgres(databaseUrl, { max: 1, idle_timeout: 1, connect_timeout: 5 });
			try {
				for (const id of ids) {
					await client`
						DELETE FROM contact_submissions
						WHERE id = ${id}
					`;
				}
			} finally {
				await client.end({ timeout: 1 });
			}
		},
	};
}

function writeSeedFile(rootDir: string, file: SeedFile): boolean {
	const absolutePath = join(rootDir, file.path);
	const nextContent = file.content;
	const current = existsSync(absolutePath) ? readFileSync(absolutePath) : null;
	if (
		current &&
		Buffer.compare(
			current,
			Buffer.isBuffer(nextContent) ? nextContent : Buffer.from(nextContent)
		) === 0
	) {
		return false;
	}
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, nextContent);
	return true;
}

function removeSeedFile(rootDir: string, file: SeedFile): boolean {
	const absolutePath = join(rootDir, file.path);
	if (!existsSync(absolutePath)) return false;
	rmSync(absolutePath, { force: true });
	return true;
}

function removeEmptySeedDirs(rootDir: string): void {
	for (const path of ['static/uploads/seed']) {
		const absolutePath = join(rootDir, path);
		if (!existsSync(absolutePath)) continue;
		if (readdirSync(absolutePath).length === 0)
			rmSync(absolutePath, { recursive: true, force: true });
	}
}

export async function runSeedDev(options: SeedDevOptions = {}): Promise<SeedDevResult> {
	const rootDir = options.rootDir ?? process.cwd();
	const env = options.env ?? process.env;
	const databaseUrl = databaseUrlFrom(rootDir, env);
	const db = options.db ?? (databaseUrl ? defaultDatabase(databaseUrl) : null);
	const messages: string[] = [];

	if (!db) {
		return {
			exitCode: 1,
			messages: ['DATABASE_URL is missing. NEXT: Run ./bootstrap before seed:dev.'],
		};
	}

	if (options.reset) {
		let removedFiles = 0;
		for (const file of SEED_FILES) if (removeSeedFile(rootDir, file)) removedFiles += 1;
		removeEmptySeedDirs(rootDir);
		await db.deleteContactSubmissions(CONTACT_ROWS.map((row) => row.id));
		messages.push(
			`Removed ${removedFiles} seed files and ${CONTACT_ROWS.length} contact submissions.`
		);
		return { exitCode: 0, messages };
	}

	let changedFiles = 0;
	for (const file of SEED_FILES) if (writeSeedFile(rootDir, file)) changedFiles += 1;
	await db.insertContactSubmissions(CONTACT_ROWS);
	messages.push(
		`Seeded ${changedFiles} changed files and ${CONTACT_ROWS.length} contact submissions.`
	);
	messages.push('Re-run seed:dev any time; deterministic seed records will update in place.');
	return { exitCode: 0, messages };
}

export async function main(
	argv: readonly string[] = process.argv.slice(2),
	options: SeedDevOptions = {}
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const parsed = parseArgs(argv);
		const result = await runSeedDev({
			...options,
			...parsed,
			rootDir: options.rootDir ?? ROOT_DIR,
		});
		const output = result.messages.join('\n') + '\n';
		if (result.exitCode === 0) stdout.write(output);
		else stderr.write(output);
		return result.exitCode;
	} catch (error) {
		stderr.write(`FAIL seed:dev ${error instanceof Error ? error.message : String(error)}\n`);
		stderr.write('NEXT: Fix the seed input above and re-run bun run seed:dev.\n');
		return 1;
	}
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	process.exit(await main());
}
