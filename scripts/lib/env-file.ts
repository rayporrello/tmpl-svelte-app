import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { BootstrapScriptError } from './errors';

export type EnvMap = Record<string, string>;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function unescapeDoubleQuoted(value: string): string {
	return value.replace(/\\([nrt"\\])/g, (_, escaped: string) => {
		switch (escaped) {
			case 'n':
				return '\n';
			case 'r':
				return '\r';
			case 't':
				return '\t';
			case '"':
				return '"';
			case '\\':
				return '\\';
			default:
				return escaped;
		}
	});
}

function stripInlineComment(value: string): string {
	const match = value.match(/(^|[ \t])#/u);
	if (!match || match.index === undefined) return value.trim();
	return value.slice(0, match.index).trimEnd();
}

function parseValue(rawValue: string, lineNumber: number): string {
	const value = rawValue.trim();
	if (!value) return '';

	if (value.startsWith("'")) {
		const end = value.indexOf("'", 1);
		if (end === -1) {
			throw new BootstrapScriptError(
				'BOOT-ENV-001',
				`.env single-quoted value is not closed on line ${lineNumber}`,
				'NEXT: Close the quote or remove the malformed line.'
			);
		}
		return value.slice(1, end);
	}

	if (value.startsWith('"')) {
		let escaped = false;
		for (let i = 1; i < value.length; i += 1) {
			const char = value[i];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === '"') return unescapeDoubleQuoted(value.slice(1, i));
		}
		throw new BootstrapScriptError(
			'BOOT-ENV-001',
			`.env double-quoted value is not closed on line ${lineNumber}`,
			'NEXT: Close the quote or remove the malformed line.'
		);
	}

	return stripInlineComment(value);
}

export function parseEnv(raw: string): EnvMap {
	const env: EnvMap = {};
	const lines = raw.split(/\r?\n/u);

	for (const [index, line] of lines.entries()) {
		const lineNumber = index + 1;
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const assignment = trimmed.startsWith('export ')
			? trimmed.slice('export '.length).trim()
			: trimmed;
		const equalsIndex = assignment.indexOf('=');
		if (equalsIndex === -1) {
			throw new BootstrapScriptError(
				'BOOT-ENV-001',
				`.env line ${lineNumber} is missing "="`,
				'NEXT: Use KEY=value syntax or remove the malformed line.'
			);
		}

		const key = assignment.slice(0, equalsIndex).trim();
		if (!KEY_PATTERN.test(key)) {
			throw new BootstrapScriptError(
				'BOOT-ENV-001',
				`.env line ${lineNumber} has invalid key "${key}"`,
				'NEXT: Use shell-compatible env var names like DATABASE_URL.'
			);
		}

		env[key] = parseValue(assignment.slice(equalsIndex + 1), lineNumber);
	}

	return env;
}

export function readEnv(path: string): EnvMap {
	if (!existsSync(path)) return {};
	return parseEnv(readFileSync(path, 'utf8'));
}

export function mergeEnv(existing: EnvMap, additions: EnvMap): EnvMap {
	const merged: EnvMap = { ...existing };
	for (const [key, value] of Object.entries(additions)) {
		if (!(key in merged)) merged[key] = value;
	}
	return merged;
}

function quoteValue(value: string): string {
	if (value === '') return '""';
	if (/^[^\s#'"]+$/u.test(value)) return value;
	return `"${value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/"/g, '\\"')}"`;
}

export function serializeEnv(env: EnvMap): string {
	return Object.entries(env)
		.map(([key, value]) => `${key}=${quoteValue(value)}`)
		.join('\n')
		.concat('\n');
}

export function writeEnv(path: string, env: EnvMap): void {
	writeFileSync(path, serializeEnv(env), 'utf8');
}
