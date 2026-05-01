import { spawn } from 'node:child_process';
import { once } from 'node:events';

export type RunResult = {
	code: number;
	stdout: string;
	stderr: string;
	durationMs: number;
};

export type WritableLike = {
	write(chunk: string): unknown;
};

export type RunOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	capture?: boolean;
	stdout?: WritableLike;
	stderr?: WritableLike;
	stdin?: string;
};

const POSTGRES_URL_WITH_PASSWORD =
	/\b(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s/]+)(@[^/\s]*(?:\/[^\s]*)?)/giu;
const HEX_32_BYTE_SECRET = /\b[a-f0-9]{64}\b/giu;

export function redactSecrets(value: string): string {
	return value
		.replace(POSTGRES_URL_WITH_PASSWORD, '$1[REDACTED]$3')
		.replace(HEX_32_BYTE_SECRET, '[REDACTED]');
}

export function run(
	command: string,
	args: readonly string[] = [],
	options: RunOptions = {}
): Promise<RunResult> {
	const startedAt = Date.now();

	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			cwd: options.cwd,
			env: options.env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		const stdoutEnded = once(child.stdout, 'end');
		const stderrEnded = once(child.stderr, 'end');

		child.stdout.on('data', (chunk: string) => {
			const redacted = redactSecrets(chunk);
			stdout += redacted;
			if (!options.capture) (options.stdout ?? process.stdout).write(redacted);
		});

		child.stderr.on('data', (chunk: string) => {
			const redacted = redactSecrets(chunk);
			stderr += redacted;
			if (!options.capture) (options.stderr ?? process.stderr).write(redacted);
		});

		child.on('error', reject);
		child.on('close', async (code) => {
			await Promise.all([stdoutEnded, stderrEnded]);
			resolve({
				code: code ?? 1,
				stdout,
				stderr,
				durationMs: Date.now() - startedAt,
			});
		});

		if (options.stdin !== undefined) child.stdin.end(options.stdin);
		else child.stdin.end();
	});
}
