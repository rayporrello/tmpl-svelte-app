import { describe, expect, it } from 'vitest';

import { redactSecrets, run } from '../../scripts/lib/run';

describe('run helper', () => {
	it('captures stdout, stderr, exit code, and duration', async () => {
		const result = await run('/bin/sh', ['-c', "printf 'hello'; printf 'warn' >&2; exit 3"], {
			capture: true,
		});

		expect(result.code).toBe(3);
		expect(result.stdout).toBe('hello');
		expect(result.stderr).toBe('warn');
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it('writes provided stdin to the child process', async () => {
		const result = await run('/bin/cat', [], { stdin: 'hello\n', capture: true });

		expect(result.code).toBe(0);
		expect(result.stdout).toBe('hello\n');
		expect(result.stderr).toBe('');
	});

	it('redacts Postgres passwords and 32-byte hex secrets', () => {
		const secret = 'a'.repeat(64);
		const redacted = redactSecrets(
			`postgres://user:super-secret@127.0.0.1:5432/db SESSION_SECRET=${secret}`
		);

		expect(redacted).toContain('postgres://user:[REDACTED]@127.0.0.1:5432/db');
		expect(redacted).toContain('SESSION_SECRET=[REDACTED]');
		expect(redacted).not.toContain('super-secret');
		expect(redacted).not.toContain(secret);
	});

	it('streams redacted output by default', async () => {
		let streamed = '';
		const result = await run('/bin/sh', ['-c', "printf 'postgres://u:p@h:5432/d'"], {
			stdout: { write: (chunk: string) => (streamed += chunk) },
		});

		expect(result.code).toBe(0);
		expect(streamed).toContain('postgres://u:[REDACTED]@h:5432/d');
	});
});
