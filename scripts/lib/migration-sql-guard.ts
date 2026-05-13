import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export type CreateExtensionViolation = {
	file: string;
	line: number;
	extension: string;
};

function collectSqlFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'meta') continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSqlFiles(path));
		} else if (entry.isFile() && entry.name.endsWith('.sql')) {
			files.push(path);
		}
	}
	return files.sort();
}

function uncommentSqlLine(
	line: string,
	inBlockComment: boolean
): { sql: string; inBlockComment: boolean } {
	let out = '';
	let index = 0;
	let inBlock = inBlockComment;

	while (index < line.length) {
		const nextTwo = line.slice(index, index + 2);
		if (inBlock) {
			if (nextTwo === '*/') {
				inBlock = false;
				index += 2;
			} else {
				index += 1;
			}
			continue;
		}
		if (nextTwo === '--') break;
		if (nextTwo === '/*') {
			inBlock = true;
			index += 2;
			continue;
		}
		out += line[index];
		index += 1;
	}

	return { sql: out, inBlockComment: inBlock };
}

export function findCreateExtensionViolations(
	rootDir: string,
	allowedExtensions: ReadonlySet<string> = new Set()
): CreateExtensionViolation[] {
	const violations: CreateExtensionViolation[] = [];
	const drizzleDir = join(rootDir, 'drizzle');
	const allowed = new Set([...allowedExtensions].map((value) => value.toLowerCase()));
	const pattern = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_.-]+))/giu;

	for (const file of collectSqlFiles(drizzleDir)) {
		let inBlockComment = false;
		const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
		for (const [index, line] of lines.entries()) {
			const uncommented = uncommentSqlLine(line, inBlockComment);
			inBlockComment = uncommented.inBlockComment;
			for (const match of uncommented.sql.matchAll(pattern)) {
				const extension = (match[1] ?? match[2] ?? '').toLowerCase();
				if (extension && !allowed.has(extension)) {
					violations.push({
						file: relative(rootDir, file),
						line: index + 1,
						extension,
					});
				}
			}
		}
	}

	return violations;
}

export function allowedExtensionsFromEnv(value: string | undefined): Set<string> {
	return new Set(
		(value ?? '')
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean)
	);
}
