import { describe, expect, it } from 'vitest';

import { fail, ok, run, skip, summary, type PrintStream } from '../../scripts/lib/print';

function memoryStream(): { chunks: string[]; stream: PrintStream } {
	const chunks: string[] = [];
	return {
		chunks,
		stream: {
			write(chunk: string) {
				chunks.push(chunk);
			},
		},
	};
}

describe('print helpers', () => {
	it('prints status vocabulary to the provided stream', () => {
		const { chunks, stream } = memoryStream();
		expect(ok('Dependencies installed', { stream })).toBe('OK   Dependencies installed');
		expect(run('bun install', { stream })).toBe('RUN  bun install');
		expect(skip('init:site', 'already complete', { stream })).toBe(
			'SKIP init:site - already complete'
		);
		expect(chunks.join('')).toContain('OK   Dependencies installed\n');
	});

	it('prints failure output with a stable code and NEXT line', () => {
		const { chunks, stream } = memoryStream();
		const output = fail('BOOT-PG-001', undefined, 'Install Podman.', { stream });
		expect(output).toContain('FAIL BOOT-PG-001');
		expect(output).toContain('NEXT: Install Podman.');
		expect(chunks.join('')).toBe(`${output}\n`);
	});

	it('renders summary blocks', () => {
		const { chunks, stream } = memoryStream();
		summary([{ title: 'Next:', lines: ['bun run dev', 'edit content/pages/home.yml'] }], {
			stream,
		});
		expect(chunks.join('')).toContain('Next:\n  bun run dev\n  edit content/pages/home.yml\n');
	});
});
