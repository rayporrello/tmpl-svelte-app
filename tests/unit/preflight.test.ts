import { describe, expect, it } from 'vitest';

import {
	checkBun,
	compareVersions,
	detectContainerRuntime,
	gitWorkingTreeDirty,
} from '../../scripts/lib/preflight';
import type { RunResult } from '../../scripts/lib/run';

const okResult: RunResult = { code: 0, stdout: '', stderr: '', durationMs: 1 };

describe('preflight helpers', () => {
	it('compares semantic version strings', () => {
		expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
		expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
		expect(compareVersions('1.0.9', '1.1.0')).toBe(-1);
	});

	it('checks Bun version against the minimum', () => {
		expect(checkBun('1.1.0').ok).toBe(true);
		expect(checkBun('1.0.30')).toEqual({
			ok: false,
			version: '1.0.30',
			reason: 'Bun 1.1.0 or newer is required.',
		});
	});

	it('honors explicit BOOTSTRAP_CONTAINER_RUNTIME without probing', async () => {
		let probes = 0;
		const runtime = await detectContainerRuntime({
			env: { BOOTSTRAP_CONTAINER_RUNTIME: 'docker' },
			commandExists: async () => {
				probes += 1;
				return false;
			},
		});
		expect(runtime).toBe('docker');
		expect(probes).toBe(0);
	});

	it('detects Podman before Docker in auto mode', async () => {
		const seen: string[] = [];
		const runtime = await detectContainerRuntime({
			env: { BOOTSTRAP_CONTAINER_RUNTIME: 'auto' },
			commandExists: async (command) => {
				seen.push(command);
				return command === 'podman';
			},
		});
		expect(runtime).toBe('podman');
		expect(seen).toEqual(['podman']);
	});

	it('reports dirty git working trees and treats git failure as dirty', async () => {
		expect(
			await gitWorkingTreeDirty({
				runner: async () => ({ ...okResult, stdout: ' M package.json\n' }),
			})
		).toBe(true);
		expect(
			await gitWorkingTreeDirty({
				runner: async () => ({ ...okResult, stdout: '' }),
			})
		).toBe(false);
		expect(
			await gitWorkingTreeDirty({
				runner: async () => ({ ...okResult, code: 128 }),
			})
		).toBe(true);
	});
});
