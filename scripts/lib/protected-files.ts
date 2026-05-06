import { isAbsolute, relative } from 'node:path';

export const PROTECTED_FILES = [
	'.env',
	'.bootstrap.state.json',
	'.template/project.json',
	'site.project.json',
	'package.json',
	'src/app.html',
	'src/lib/config/site.ts',
	'static/admin/config.yml',
	'static/site.webmanifest',
	'.env.example',
	'deploy/env.example',
	'deploy/Caddyfile.example',
	'deploy/Containerfile.postgres',
	'deploy/quadlets/web.container',
	'deploy/quadlets/web.network',
	'deploy/quadlets/postgres.container',
	'deploy/quadlets/postgres.volume',
	'deploy/quadlets/worker.container',
	'deploy/systemd/backup.service',
	'deploy/systemd/backup.timer',
	'deploy/systemd/backup-base.service',
	'deploy/systemd/backup-base.timer',
	'deploy/systemd/backup-check.service',
	'deploy/systemd/backup-check.timer',
	'content/pages/home.yml',
	'README.md',
] as const;

export const INIT_SITE_OWNED_FILES = [
	'site.project.json',
	'package.json',
	'src/app.html',
	'src/lib/config/site.ts',
	'static/admin/config.yml',
	'static/site.webmanifest',
	'.env.example',
	'deploy/env.example',
	'deploy/Caddyfile.example',
	'deploy/Containerfile.postgres',
	'deploy/quadlets/web.container',
	'deploy/quadlets/web.network',
	'deploy/quadlets/postgres.container',
	'deploy/quadlets/postgres.volume',
	'deploy/quadlets/worker.container',
	'deploy/systemd/backup.service',
	'deploy/systemd/backup.timer',
	'deploy/systemd/backup-base.service',
	'deploy/systemd/backup-base.timer',
	'deploy/systemd/backup-check.service',
	'deploy/systemd/backup-check.timer',
	'content/pages/home.yml',
	'README.md',
] as const;

const protectedSet = new Set<string>(PROTECTED_FILES);

export function normalizeRepoPath(path: string, rootDir = process.cwd()): string {
	const relativePath = isAbsolute(path) ? relative(rootDir, path) : path;
	return relativePath.replace(/\\/g, '/').replace(/^\.\//u, '');
}

export function isAllowed(path: string): boolean {
	const normalized = normalizeRepoPath(path);
	return protectedSet.has(normalized) && !normalized.startsWith('../');
}
