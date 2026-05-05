// Pre-install guard: enforce that the package manager is Bun, and that the
// Bun major.minor matches the range pinned in package.json `engines.bun`.
//
// This runs as `preinstall`, so it executes before any package install — both
// in local dev (`bun install`) and in the Containerfile builder stage. A
// mismatched Bun on the host catches at this gate instead of producing a
// silently-different lockfile or build.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const userAgent = process.env.npm_config_user_agent ?? '';

if (!userAgent.startsWith('bun/')) {
	console.error(
		'FAIL BUN-PM-001 This repository uses Bun. Run `bun install` — do not use npm, pnpm, or yarn.'
	);
	process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgJsonPath = resolve(scriptDir, '..', 'package.json');

let enginesBun: string | undefined;
try {
	const raw = readFileSync(pkgJsonPath, 'utf8');
	const pkg = JSON.parse(raw) as { engines?: { bun?: string } };
	enginesBun = pkg.engines?.bun;
} catch (err) {
	console.error(
		`FAIL BUN-PM-002 Could not read package.json to determine the supported Bun range: ${
			(err as Error).message
		}`
	);
	process.exit(1);
}

if (!enginesBun) {
	console.error('FAIL BUN-PM-003 package.json engines.bun is missing.');
	process.exit(1);
}

// Bun's user-agent looks like "bun/1.3.13 (linux; x64)".
const versionMatch = userAgent.match(/^bun\/(\d+)\.(\d+)\.(\d+)/u);
if (!versionMatch) {
	console.error(
		`FAIL BUN-PM-004 Could not parse Bun version from npm_config_user_agent="${userAgent}".`
	);
	process.exit(1);
}

const [, majorStr, minorStr, patchStr] = versionMatch;
const current = {
	major: Number(majorStr),
	minor: Number(minorStr),
	patch: Number(patchStr),
};

// Parse a simple `>=A.B.C <D.E.F` range. The repo pins one of these; we do not
// import a full semver library to keep this preinstall guard zero-dep.
const rangeMatch = enginesBun.match(/^>=\s*(\d+)\.(\d+)\.(\d+)\s+<\s*(\d+)\.(\d+)\.(\d+)$/u);
if (!rangeMatch) {
	console.error(
		`FAIL BUN-PM-005 engines.bun="${enginesBun}" is not in the expected ">=X.Y.Z <A.B.C" form. ` +
			`Update scripts/ensure-bun.ts if the range syntax has changed.`
	);
	process.exit(1);
}

const [, minMaj, minMin, minPat, maxMaj, maxMin, maxPat] = rangeMatch;
const min = { major: Number(minMaj), minor: Number(minMin), patch: Number(minPat) };
const max = { major: Number(maxMaj), minor: Number(maxMin), patch: Number(maxPat) };

function compare(a: typeof current, b: typeof current): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	return a.patch - b.patch;
}

const tooOld = compare(current, min) < 0;
const tooNew = compare(current, max) >= 0;

if (tooOld || tooNew) {
	const formatted = `${current.major}.${current.minor}.${current.patch}`;
	console.error(`FAIL BUN-PM-006 Bun ${formatted} is outside the supported range ${enginesBun}.`);
	console.error('NEXT:  Install a supported Bun version. https://bun.sh/docs/installation');
	console.error(
		'       The repo pins to a specific Bun major.minor on purpose — bumping is a deliberate change tracked in CHANGELOG.md.'
	);
	process.exit(1);
}
