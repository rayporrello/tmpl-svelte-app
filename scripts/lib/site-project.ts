import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SITE_PROJECT_SCHEMA_VERSION = 1;
export const SITE_PROJECT_PATH = 'site.project.json';

export type SiteProjectManifest = {
	schemaVersion: 1;
	project: {
		packageName: string;
		projectSlug: string;
		githubOwner: string;
		githubRepo: string;
	};
	site: {
		name: string;
		productionUrl: string;
		productionDomain: string;
		defaultDescription: string;
		supportEmail: string;
		pwaShortName: string;
		themeColor: string;
	};
	deployment: {
		unitName: string;
		containerImage: string;
	};
	cms: {
		backendRepo: string;
		branch: string;
	};
	assets: {
		defaultOgImage: string;
		organizationLogoPath: string;
	};
};

export type InitSiteAnswers = {
	packageName: string;
	siteName: string;
	siteUrl: string;
	description: string;
	ghOwner: string;
	ghRepo: string;
	contactEmail: string;
	project: string;
	domain: string;
	shortName: string;
	themeColor?: string;
};

export type ProjectFileUpdate = {
	path: string;
	current: string;
	next: string;
	ownership: 'full' | 'region';
};

export type ProjectCheckResult = {
	manifest: SiteProjectManifest;
	errors: string[];
	updates: ProjectFileUpdate[];
};

const REQUIRED_STRING_PATHS = [
	'project.packageName',
	'project.projectSlug',
	'project.githubOwner',
	'project.githubRepo',
	'site.name',
	'site.productionUrl',
	'site.productionDomain',
	'site.defaultDescription',
	'site.supportEmail',
	'site.pwaShortName',
	'site.themeColor',
	'deployment.unitName',
	'deployment.containerImage',
	'cms.backendRepo',
	'cms.branch',
	'assets.defaultOgImage',
	'assets.organizationLogoPath',
] as const;

export const PROJECT_GENERATED_FILES = [
	'package.json',
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
	'deploy/systemd/restore-drill.service',
	'deploy/systemd/restore-drill.timer',
] as const;

export const PROJECT_REGION_FILES = ['README.md', 'src/app.html'] as const;

export const PROJECT_CLAUDE_MD_PATH = 'CLAUDE.md';
export const PROJECT_CLAUDE_MD_TEMPLATE_PATH = 'CLAUDE.md.template';
const CLAUDE_AUTO_BEGIN = '<!-- BEGIN AUTO: site.project.json -->';
const CLAUDE_AUTO_END = '<!-- END AUTO -->';

function readFile(rootDir: string, relPath: string): string {
	const path = resolve(rootDir, relPath);
	if (!existsSync(path)) return '';
	return readFileSync(path, 'utf8');
}

function getPath(input: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((current, key) => {
		if (!current || typeof current !== 'object') return undefined;
		return (current as Record<string, unknown>)[key];
	}, input);
}

function normalizeUrl(value: string): string {
	return value.replace(/\/+$/u, '');
}

function assertString(errors: string[], input: unknown, path: string): string {
	const value = getPath(input, path);
	if (typeof value !== 'string' || value.trim().length === 0) {
		errors.push(`${path} is required.`);
		return '';
	}
	return value.trim();
}

function validateUrl(errors: string[], path: string, value: string): void {
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'https:') {
			errors.push(`${path} must use https://.`);
		}
		if (value.endsWith('/')) {
			errors.push(`${path} must not include a trailing slash.`);
		}
	} catch {
		errors.push(`${path} must be a valid URL.`);
	}
}

function validateHex(errors: string[], path: string, value: string): void {
	if (!/^#[0-9a-f]{6}$/iu.test(value)) {
		errors.push(`${path} must be a 6-digit hex color, for example #0B1120.`);
	}
}

function validateRepo(errors: string[], path: string, value: string): void {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
		errors.push(`${path} must be in owner/repo form.`);
	}
}

export function validateProjectManifest(input: unknown): {
	manifest: SiteProjectManifest | null;
	errors: string[];
} {
	const errors: string[] = [];
	const schemaVersion = getPath(input, 'schemaVersion');
	if (schemaVersion !== SITE_PROJECT_SCHEMA_VERSION) {
		errors.push(`schemaVersion must be ${SITE_PROJECT_SCHEMA_VERSION}.`);
	}

	const values = Object.fromEntries(
		REQUIRED_STRING_PATHS.map((path) => [path, assertString(errors, input, path)])
	);

	const productionUrl = normalizeUrl(values['site.productionUrl']);
	const cmsRepo = values['cms.backendRepo'];
	const ownerRepo = `${values['project.githubOwner']}/${values['project.githubRepo']}`;

	if (productionUrl) validateUrl(errors, 'site.productionUrl', productionUrl);
	if (values['site.themeColor']) validateHex(errors, 'site.themeColor', values['site.themeColor']);
	if (cmsRepo) validateRepo(errors, 'cms.backendRepo', cmsRepo);
	if (ownerRepo !== cmsRepo && cmsRepo) {
		errors.push('cms.backendRepo must match project.githubOwner/project.githubRepo.');
	}
	if (
		values['deployment.unitName'] &&
		values['deployment.unitName'] !== `${values['project.projectSlug']}-web`
	) {
		errors.push('deployment.unitName must be project.projectSlug + "-web".');
	}
	if (
		values['deployment.containerImage'] &&
		!values['deployment.containerImage'].includes(ownerRepo)
	) {
		errors.push('deployment.containerImage must include project.githubOwner/project.githubRepo.');
	}

	if (errors.length > 0) return { manifest: null, errors };

	return {
		errors,
		manifest: {
			schemaVersion: SITE_PROJECT_SCHEMA_VERSION,
			project: {
				packageName: values['project.packageName'],
				projectSlug: values['project.projectSlug'],
				githubOwner: values['project.githubOwner'],
				githubRepo: values['project.githubRepo'],
			},
			site: {
				name: values['site.name'],
				productionUrl,
				productionDomain: values['site.productionDomain'],
				defaultDescription: values['site.defaultDescription'],
				supportEmail: values['site.supportEmail'],
				pwaShortName: values['site.pwaShortName'],
				themeColor: values['site.themeColor'].toUpperCase(),
			},
			deployment: {
				unitName: values['deployment.unitName'],
				containerImage: values['deployment.containerImage'],
			},
			cms: {
				backendRepo: cmsRepo,
				branch: values['cms.branch'],
			},
			assets: {
				defaultOgImage: values['assets.defaultOgImage'],
				organizationLogoPath: values['assets.organizationLogoPath'],
			},
		},
	};
}

export function readProjectManifest(rootDir: string): SiteProjectManifest {
	const path = resolve(rootDir, SITE_PROJECT_PATH);
	if (!existsSync(path)) {
		throw new Error(`${SITE_PROJECT_PATH} is missing.`);
	}
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	const result = validateProjectManifest(parsed);
	if (!result.manifest) {
		throw new Error(
			`Invalid ${SITE_PROJECT_PATH}:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
	return result.manifest;
}

export function isTemplateProjectManifest(manifest: SiteProjectManifest): boolean {
	return (
		manifest.project.packageName === 'tmpl-svelte-app' &&
		manifest.site.name === 'Your Site Name' &&
		manifest.site.productionUrl === 'https://example.com'
	);
}

export function writeProjectManifest(rootDir: string, manifest: SiteProjectManifest): void {
	writeFileSync(resolve(rootDir, SITE_PROJECT_PATH), JSON.stringify(manifest, null, '\t') + '\n');
}

export function manifestFromAnswers(answers: InitSiteAnswers): SiteProjectManifest {
	const productionUrl = normalizeUrl(answers.siteUrl);
	const domain = answers.domain || new URL(productionUrl).hostname;
	const ownerRepo = `${answers.ghOwner}/${answers.ghRepo}`;
	return {
		schemaVersion: SITE_PROJECT_SCHEMA_VERSION,
		project: {
			packageName: answers.packageName,
			projectSlug: answers.project,
			githubOwner: answers.ghOwner,
			githubRepo: answers.ghRepo,
		},
		site: {
			name: answers.siteName,
			productionUrl,
			productionDomain: domain,
			defaultDescription: answers.description,
			supportEmail: answers.contactEmail,
			pwaShortName: answers.shortName,
			themeColor: answers.themeColor ?? '#0B1120',
		},
		deployment: {
			unitName: `${answers.project}-web`,
			containerImage: `ghcr.io/${ownerRepo}:<sha>`,
		},
		cms: {
			backendRepo: ownerRepo,
			branch: 'main',
		},
		assets: {
			defaultOgImage: '/og-default.png',
			organizationLogoPath: '/images/logo.png',
		},
	};
}

function rewritePackageJson(content: string, manifest: SiteProjectManifest): string {
	return content.replace(/"name":\s*"[^"]*"/u, `"name": "${manifest.project.packageName}"`);
}

function rewriteSiteTs(content: string, manifest: SiteProjectManifest): string {
	let out = content;
	const logoUrl = `${manifest.site.productionUrl}${manifest.assets.organizationLogoPath}`;
	out = out.replace(/(name:\s*')[^']*(')/gu, `$1${manifest.site.name}$2`);
	out = out.replace(/(url:\s*')[^']*(')/gu, `$1${manifest.site.productionUrl}$2`);
	out = out.replace(/(defaultTitle:\s*')[^']*(')/gu, `$1${manifest.site.name}$2`);
	out = out.replace(/(titleTemplate:\s*')[^']*(')/gu, `$1%s — ${manifest.site.name}$2`);
	out = out.replace(
		/(defaultDescription:\s*')[^']*(')/gu,
		`$1${manifest.site.defaultDescription}$2`
	);
	out = out.replace(/(defaultOgImage:\s*')[^']*(')/gu, `$1${manifest.assets.defaultOgImage}$2`);
	out = out.replace(/(logo:\s*')[^']*(')/gu, `$1${logoUrl}$2`);
	out = out.replace(/(email:\s*')[^']*(')/gu, `$1${manifest.site.supportEmail}$2`);
	return out;
}

function rewriteConfigYml(content: string, manifest: SiteProjectManifest): string {
	let out = content.replace(
		/^(\s*repo:\s*)([^\s#]+)(.*)$/mu,
		(_, prefix, _old, rest) => `${prefix}${manifest.cms.backendRepo}${rest}`
	);
	out = out.replace(/^(\s*branch:\s*)([^\s#]+)(.*)$/mu, (_, prefix, _old, rest) => {
		return `${prefix}${manifest.cms.branch}${rest}`;
	});
	return out;
}

function rewriteWebmanifest(content: string, manifest: SiteProjectManifest): string {
	const parsed = JSON.parse(content) as Record<string, unknown>;
	parsed.name = manifest.site.name;
	parsed.short_name = manifest.site.pwaShortName;
	if (
		typeof parsed.description !== 'string' ||
		parsed.description.includes('REPLACE PER PROJECT') ||
		parsed.description === 'Your Site Name'
	) {
		parsed.description = `${manifest.site.name} — website`;
	}
	return JSON.stringify(parsed, null, 2) + '\n';
}

function rewriteReadme(content: string, manifest: SiteProjectManifest): string {
	return content.replace(/^# .+$/mu, `# ${manifest.site.name}`);
}

function rewriteAppHtml(content: string, manifest: SiteProjectManifest): string {
	return content.replace(
		/(<meta name="theme-color" content=")[^"]*(" \/>)/u,
		`$1${manifest.site.themeColor}$2`
	);
}

function rewriteEnvExample(content: string, manifest: SiteProjectManifest): string {
	let out = content;
	const dbSlug = manifest.project.projectSlug.replace(/-/g, '_');
	out = out.replace(/^ORIGIN=.*/mu, `ORIGIN=${manifest.site.productionUrl}`);
	out = out.replace(/^PUBLIC_SITE_URL=.*/mu, `PUBLIC_SITE_URL=${manifest.site.productionUrl}`);
	out = out.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^DATABASE_URL=.*/mu,
		`DATABASE_URL=postgres://${dbSlug}_app_user:replace-me@${manifest.project.projectSlug}-postgres:5432/${dbSlug}_app`
	);
	out = out.replace(
		/^DATABASE_DIRECT_URL=.*/mu,
		`DATABASE_DIRECT_URL=postgres://${dbSlug}_app_user:replace-me@127.0.0.1:5432/${dbSlug}_app`
	);
	out = out.replace(/^POSTGRES_DB=.*/mu, `POSTGRES_DB=${dbSlug}_app`);
	out = out.replace(/^POSTGRES_USER=.*/mu, `POSTGRES_USER=${dbSlug}_app_user`);
	return out;
}

function rewriteDeployEnvExample(content: string, manifest: SiteProjectManifest): string {
	let out = rewriteEnvExample(content, manifest);
	const dbSlug = manifest.project.projectSlug.replace(/-/g, '_');
	out = out.replace(
		/^DATABASE_URL=.*/mu,
		`DATABASE_URL=postgres://${dbSlug}_app_user:replace-me@${manifest.project.projectSlug}-postgres:5432/${dbSlug}_app`
	);
	out = out.replace(
		/^DATABASE_DIRECT_URL=.*/mu,
		`DATABASE_DIRECT_URL=postgres://${dbSlug}_app_user:replace-me@127.0.0.1:5432/${dbSlug}_app`
	);
	out = out.replace(/^POSTGRES_DB=.*/mu, `POSTGRES_DB=${dbSlug}_app`);
	out = out.replace(/^POSTGRES_USER=.*/mu, `POSTGRES_USER=${dbSlug}_app_user`);
	return out;
}

function rewriteCaddyfile(content: string, manifest: SiteProjectManifest): string {
	const apex = manifest.site.productionDomain.replace(/^www\./u, '');
	let out = content;
	out = out.replace(
		'Replace example.com with the real domain before use.',
		`Configured for ${apex}.`
	);
	out = out.replace(/^www\.[a-z0-9][a-z0-9.-]+\.[a-z]{2,}\s*\{/gmu, `www.${apex} {`);
	out = out.replace(/^(?!www\.)([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s*\{/gmu, `${apex} {`);
	out = out.replace(
		/(redir https:\/\/)[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\{uri\} permanent)/u,
		`$1${apex}$2`
	);
	out = out.replace(/\bexample\.com\b/gu, apex);
	return out;
}

function rewriteQuadlet(content: string, manifest: SiteProjectManifest): string {
	let out = content;
	out = out.replace(/<unit-name>/gu, manifest.deployment.unitName);
	out = out.replace(/<owner>/gu, manifest.project.githubOwner);
	out = out.replace(/<name>/gu, manifest.project.githubRepo);
	out = out.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Image=)(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.deployment.containerImage}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^.]+)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Network=)([^.]+)(\.network)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(HostName=)(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.deployment.unitName}`
	);
	out = out.replace(
		/^(Description=SvelteKit web app — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	return out;
}

function rewriteQuadletNetwork(content: string, manifest: SiteProjectManifest): string {
	let out = content;
	out = out.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=Project network — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	return out;
}

function rewritePostgresQuadlet(content: string, manifest: SiteProjectManifest): string {
	let out = content
		.replace(/<owner>/gu, manifest.project.githubOwner)
		.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=(?:Postgres database|Postgres 18 \+ WAL-G) — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Network=)([^.]+)(\.network)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(HostName=)(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}-postgres`
	);
	out = out.replace(
		/^(Volume=)([^:]+)(:\/var\/lib\/postgresql\/data)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}-postgres-data${suffix}`
	);
	return out;
}

function rewritePostgresVolume(content: string, manifest: SiteProjectManifest): string {
	let out = content.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=Postgres data volume — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(VolumeName=)(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}-postgres-data`
	);
	return out;
}

function rewriteBackupSystemd(content: string, manifest: SiteProjectManifest): string {
	let out = content;
	out = out.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=Nightly backup .+? — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(WorkingDirectory=%h\/)([^\s]+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Unit=)([^\s]+?)(-backup\.service)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	return out;
}

function rewriteWorkerQuadlet(content: string, manifest: SiteProjectManifest): string {
	let out = content
		.replace(/<owner>/gu, manifest.project.githubOwner)
		.replace(/<name>/gu, manifest.project.githubRepo)
		.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=Automation outbox worker — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	return out;
}

function rewriteContainerfilePostgres(content: string, manifest: SiteProjectManifest): string {
	// Containerfile.postgres carries the WAL-G + PG version pins (deliberate,
	// global) plus a few comments that reference the project slug. The build
	// itself is generic per-client; init:site only sweeps the comments so the
	// placeholder check passes after init.
	return content
		.replace(/<owner>/gu, manifest.project.githubOwner)
		.replace(/<name>/gu, manifest.project.githubRepo)
		.replace(/<project>/gu, manifest.project.projectSlug);
}

function rewriteBackupBaseSystemd(content: string, manifest: SiteProjectManifest): string {
	let out = content.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=WAL-G base backup(?: timer)? — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(WorkingDirectory=%h\/)([^\s]+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(ExecStart=%h\/)([^\s/]+)(\/scripts\/.+)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Unit=)([^\s]+?)(-backup-base\.service)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	return out;
}

function rewriteBackupCheckSystemd(content: string, manifest: SiteProjectManifest): string {
	let out = content.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=PITR freshness check(?: timer)? — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(WorkingDirectory=%h\/)([^\s]+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(ExecStart=%h\/)([^\s/]+)(\/scripts\/.+)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Unit=)([^\s]+?)(-backup-check\.service)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	return out;
}

function rewriteRestoreDrillSystemd(content: string, manifest: SiteProjectManifest): string {
	let out = content.replace(/<project>/gu, manifest.project.projectSlug);
	out = out.replace(
		/^(Description=Weekly non-destructive restore drill(?: timer)? — )(.+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(WorkingDirectory=%h\/)([^\s]+)$/mu,
		(_, prefix) => `${prefix}${manifest.project.projectSlug}`
	);
	out = out.replace(
		/^(EnvironmentFile=%h\/secrets\/)([^\s]+?)(\.prod\.env)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	out = out.replace(
		/^(Unit=)([^\s]+?)(-restore-drill\.service)$/mu,
		(_, prefix, _old, suffix) => `${prefix}${manifest.project.projectSlug}${suffix}`
	);
	return out;
}

const REWRITERS: Record<string, (content: string, manifest: SiteProjectManifest) => string> = {
	'package.json': rewritePackageJson,
	'src/lib/config/site.ts': rewriteSiteTs,
	'static/admin/config.yml': rewriteConfigYml,
	'static/site.webmanifest': rewriteWebmanifest,
	'.env.example': rewriteEnvExample,
	'deploy/env.example': rewriteDeployEnvExample,
	'deploy/Caddyfile.example': rewriteCaddyfile,
	'deploy/Containerfile.postgres': rewriteContainerfilePostgres,
	'deploy/quadlets/web.container': rewriteQuadlet,
	'deploy/quadlets/web.network': rewriteQuadletNetwork,
	'deploy/quadlets/postgres.container': rewritePostgresQuadlet,
	'deploy/quadlets/postgres.volume': rewritePostgresVolume,
	'deploy/quadlets/worker.container': rewriteWorkerQuadlet,
	'deploy/systemd/backup.service': rewriteBackupSystemd,
	'deploy/systemd/backup.timer': rewriteBackupSystemd,
	'deploy/systemd/backup-base.service': rewriteBackupBaseSystemd,
	'deploy/systemd/backup-base.timer': rewriteBackupBaseSystemd,
	'deploy/systemd/backup-check.service': rewriteBackupCheckSystemd,
	'deploy/systemd/backup-check.timer': rewriteBackupCheckSystemd,
	'deploy/systemd/restore-drill.service': rewriteRestoreDrillSystemd,
	'deploy/systemd/restore-drill.timer': rewriteRestoreDrillSystemd,
	'README.md': rewriteReadme,
	'src/app.html': rewriteAppHtml,
};

function buildClaudeAutoBlock(manifest: SiteProjectManifest): string {
	const ownerRepo = `${manifest.project.githubOwner}/${manifest.project.githubRepo}`;
	return [
		CLAUDE_AUTO_BEGIN,
		'<!-- Regenerated by `bun run init:site -- --write` from site.project.json. -->',
		'<!-- Edit site.project.json, not this block. The rest of the file is human-owned. -->',
		'',
		'> **Project identity** — derived from `site.project.json`:',
		'>',
		`> - **Site name:** ${manifest.site.name}`,
		`> - **Production URL:** ${manifest.site.productionUrl}`,
		`> - **GitHub repo:** ${ownerRepo}`,
		`> - **Container image:** ${manifest.deployment.containerImage}`,
		CLAUDE_AUTO_END,
	].join('\n');
}

function injectClaudeAutoBlock(content: string, autoBlock: string): string {
	const begin = content.indexOf(CLAUDE_AUTO_BEGIN);
	const end = content.indexOf(CLAUDE_AUTO_END);
	if (begin !== -1 && end !== -1 && end > begin) {
		return `${content.slice(0, begin)}${autoBlock}${content.slice(end + CLAUDE_AUTO_END.length)}`;
	}
	const h1Match = content.match(/^# .+$/mu);
	if (!h1Match || h1Match.index === undefined) {
		return `${autoBlock}\n\n${content}`;
	}
	const insertAt = h1Match.index + h1Match[0].length;
	return `${content.slice(0, insertAt)}\n\n${autoBlock}\n${content.slice(insertAt)}`;
}

function renderClaudeFromTemplate(template: string, manifest: SiteProjectManifest): string {
	let out = template;
	// Drop the operator instruction blockquote — it's no longer relevant once the
	// file has been rendered into CLAUDE.md.
	out = out.replace(
		/^> Copy this file to .+\n^> Read by Claude Code at session start\..+\n\n/mu,
		''
	);
	out = out.replace(/\[PROJECT NAME\]/gu, manifest.site.name);
	out = out.replace(/\[image name\]/gu, manifest.deployment.containerImage);
	return injectClaudeAutoBlock(out, buildClaudeAutoBlock(manifest));
}

function planClaudeUpdate(
	rootDir: string,
	manifest: SiteProjectManifest
): ProjectFileUpdate | null {
	const current = readFile(rootDir, PROJECT_CLAUDE_MD_PATH);
	let next: string;
	if (current) {
		next = injectClaudeAutoBlock(current, buildClaudeAutoBlock(manifest));
	} else {
		const template = readFile(rootDir, PROJECT_CLAUDE_MD_TEMPLATE_PATH);
		if (!template) return null;
		next = renderClaudeFromTemplate(template, manifest);
	}
	if (next === current) return null;
	return { path: PROJECT_CLAUDE_MD_PATH, current, next, ownership: 'region' };
}

export function plannedProjectUpdates(
	rootDir: string,
	manifest: SiteProjectManifest
): ProjectFileUpdate[] {
	if (isTemplateProjectManifest(manifest)) return [];

	const updates: ProjectFileUpdate[] = [];
	for (const path of [...PROJECT_GENERATED_FILES, ...PROJECT_REGION_FILES]) {
		const current = readFile(rootDir, path);
		if (!current) continue;
		const next = REWRITERS[path](current, manifest);
		if (next !== current) {
			updates.push({
				path,
				current,
				next,
				ownership: PROJECT_REGION_FILES.includes(path as (typeof PROJECT_REGION_FILES)[number])
					? 'region'
					: 'full',
			});
		}
	}
	const claudeUpdate = planClaudeUpdate(rootDir, manifest);
	if (claudeUpdate) updates.push(claudeUpdate);
	return updates;
}

export function applyProjectUpdates(rootDir: string, updates: readonly ProjectFileUpdate[]): void {
	for (const update of updates) {
		writeFileSync(resolve(rootDir, update.path), update.next, 'utf8');
	}
}

export function evaluateProjectManifest(rootDir: string): ProjectCheckResult {
	const errors: string[] = [];
	let manifest: SiteProjectManifest;
	try {
		manifest = readProjectManifest(rootDir);
	} catch (error) {
		return {
			manifest: manifestFromAnswers({
				packageName: '',
				siteName: '',
				siteUrl: 'https://example.com',
				description: '',
				ghOwner: '',
				ghRepo: '',
				contactEmail: '',
				project: '',
				domain: '',
				shortName: '',
			}),
			errors: [error instanceof Error ? error.message : String(error)],
			updates: [],
		};
	}

	return {
		manifest,
		errors,
		updates: plannedProjectUpdates(rootDir, manifest),
	};
}
