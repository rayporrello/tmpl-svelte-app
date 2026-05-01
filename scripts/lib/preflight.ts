import { run, type RunResult } from './run';

export type ContainerRuntime = 'podman' | 'docker';

export type BunCheckResult =
	| { ok: true; version: string }
	| { ok: false; version: string | null; reason: string };

export type CommandExists = (command: string) => Promise<boolean>;

export function compareVersions(actual: string, minimum: string): number {
	const actualParts = actual.split('.').map((part) => Number.parseInt(part, 10) || 0);
	const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
	const length = Math.max(actualParts.length, minimumParts.length);

	for (let i = 0; i < length; i += 1) {
		const actualPart = actualParts[i] ?? 0;
		const minimumPart = minimumParts[i] ?? 0;
		if (actualPart > minimumPart) return 1;
		if (actualPart < minimumPart) return -1;
	}

	return 0;
}

export function checkBun(version = process.versions.bun, minimum = '1.1.0'): BunCheckResult {
	if (!version) return { ok: false, version: null, reason: 'Bun is not available.' };
	if (compareVersions(version, minimum) < 0) {
		return { ok: false, version, reason: `Bun ${minimum} or newer is required.` };
	}
	return { ok: true, version };
}

async function defaultCommandExists(command: string): Promise<boolean> {
	const result = await run(command, ['--version'], { capture: true });
	return result.code === 0;
}

export async function detectContainerRuntime(
	options: {
		env?: NodeJS.ProcessEnv;
		commandExists?: CommandExists;
	} = {}
): Promise<ContainerRuntime | null> {
	const env = options.env ?? process.env;
	const requested = env.BOOTSTRAP_CONTAINER_RUNTIME ?? 'auto';
	const commandExists = options.commandExists ?? defaultCommandExists;

	if (requested === 'podman' || requested === 'docker') return requested;
	if (requested !== 'auto') return null;

	if (await commandExists('podman')) return 'podman';
	if (await commandExists('docker')) return 'docker';
	return null;
}

export async function gitWorkingTreeDirty(
	options: {
		cwd?: string;
		runner?: (
			command: string,
			args: readonly string[],
			options: { capture: true; cwd?: string }
		) => Promise<RunResult>;
	} = {}
): Promise<boolean> {
	const runner = options.runner ?? run;
	const result = await runner('git', ['status', '--porcelain'], {
		capture: true,
		cwd: options.cwd,
	});
	if (result.code !== 0) return true;
	return result.stdout.trim().length > 0;
}
