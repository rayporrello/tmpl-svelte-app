#!/usr/bin/env bun
import { allowedExtensionsFromEnv, findCreateExtensionViolations } from './lib/migration-sql-guard';

const allowed = allowedExtensionsFromEnv(process.env.DB_CHECK_ALLOWED_EXTENSIONS);
for (const arg of process.argv.slice(2)) {
	if (arg.startsWith('--allow-extension=')) {
		const extension = arg.slice('--allow-extension='.length).trim().toLowerCase();
		if (extension) allowed.add(extension);
	}
}

const violations = findCreateExtensionViolations(process.cwd(), allowed);
if (violations.length > 0) {
	console.error('FAIL: Drizzle migrations contain unauthorized CREATE EXTENSION statements.');
	for (const violation of violations) {
		console.error(
			`- ${violation.file}:${violation.line} creates extension "${violation.extension}"`
		);
	}
	console.error(
		'Website migrations run as platform_admin, which is not a Postgres superuser. Ask the platform operator to pre-install trusted extensions before deploying the migration.'
	);
	process.exit(1);
}

console.log('migration SQL guard ok');
