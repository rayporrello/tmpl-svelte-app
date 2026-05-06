import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export interface QuadletImage {
	imageRef: string;
	lineNumber: number;
	raw: string;
}

function findQuadletImage(path: string): QuadletImage {
	const content = readFileSync(path, 'utf8');
	const lines = content.split(/\n/u);
	let inContainer = false;
	const matches: QuadletImage[] = [];
	let hasContainer = false;

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		const section = /^\[([^\]]+)\]$/u.exec(trimmed);
		if (section) {
			inContainer = section[1] === 'Container';
			hasContainer ||= inContainer;
			continue;
		}

		if (!inContainer) continue;
		if (/^\s*#/u.test(line) || !/^\s*Image\s*=/u.test(line)) continue;

		const [, imageRef = ''] = line.split(/=(.*)/su);
		matches.push({
			imageRef: imageRef.trim(),
			lineNumber: index + 1,
			raw: line,
		});
	}

	if (!hasContainer) throw new Error(`Quadlet file has no [Container] section: ${path}`);
	if (matches.length === 0)
		throw new Error(`Quadlet file has no Image= line in [Container]: ${path}`);
	if (matches.length > 1) {
		throw new Error(`Quadlet file has multiple Image= lines in [Container]: ${path}`);
	}

	return matches[0];
}

export function parseQuadletImage(path: string): QuadletImage {
	return findQuadletImage(path);
}

export function replaceQuadletImage(
	path: string,
	newRef: string,
	opts: { dryRun?: boolean } = {}
): { changed: boolean; oldRef: string } {
	const image = findQuadletImage(path);
	const oldRef = image.imageRef;
	if (oldRef === newRef) return { changed: false, oldRef };
	if (opts.dryRun) return { changed: true, oldRef };

	const content = readFileSync(path, 'utf8');
	const lines = content.split(/\n/u);
	const prefix = image.raw.slice(0, image.raw.indexOf('=') + 1);
	lines[image.lineNumber - 1] = `${prefix}${newRef}`;
	const next = lines.join('\n');
	const tmpPath = `${path}.tmp`;

	try {
		writeFileSync(tmpPath, next, { mode: 0o600 });
		renameSync(tmpPath, path);
	} finally {
		if (existsSync(tmpPath)) unlinkSync(tmpPath);
	}

	return { changed: true, oldRef };
}
