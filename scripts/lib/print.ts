import type { ErrorCode } from './errors';
import { ERRORS } from './errors';

export type PrintStream = {
	write(chunk: string): unknown;
};

export type PrintOptions = {
	stream?: PrintStream;
};

export type SummaryBlock = {
	title: string;
	lines: readonly string[];
};

function writeLine(line: string, stream: PrintStream = process.stdout): string {
	stream.write(`${line}\n`);
	return line;
}

function nextLine(hint: string): string {
	return hint.startsWith('NEXT') ? hint : `NEXT: ${hint}`;
}

export function ok(label: string, options: PrintOptions = {}): string {
	return writeLine(`OK   ${label}`, options.stream);
}

export function skip(label: string, reason?: string, options: PrintOptions = {}): string {
	const line = reason ? `SKIP ${label} - ${reason}` : `SKIP ${label}`;
	return writeLine(line, options.stream);
}

export function run(label: string, options: PrintOptions = {}): string {
	return writeLine(`RUN  ${label}`, options.stream);
}

export function fail(
	code: ErrorCode,
	message = ERRORS[code],
	hint = 'See the error above and re-run after fixing it.',
	options: PrintOptions = {}
): string {
	const output = [`FAIL ${code} ${message}`, nextLine(hint)].join('\n');
	writeLine(output, options.stream ?? process.stderr);
	return output;
}

export function summary(blocks: readonly SummaryBlock[], options: PrintOptions = {}): string {
	const output = blocks
		.flatMap((block) => [
			block.title,
			...block.lines.map((line) => (line.trim() ? `  ${line}` : '')),
		])
		.join('\n');
	writeLine(output, options.stream);
	return output;
}
