#!/usr/bin/env bun
import { createInterface } from 'node:readline';
import { applyScaffoldPlan, planPageScaffold, type PageScaffoldInput } from './lib/scaffold';

interface CliOptions extends PageScaffoldInput {
	force: boolean;
	help: boolean;
}

function usage(): string {
	return `Usage: bun run scaffold:page -- --slug=about [options]

Options:
  --slug=SLUG             Page id and default route stem, kebab-case
  --title=TITLE           Page title
  --description=TEXT      SEO description and intro copy
  --route=/path           Route path (default: /SLUG)
  --indexable             Add as indexable public route (default)
  --noindex               Add as non-indexable public route
  --force                 Overwrite generated route file if present
  --help                  Show this help

With no --slug, the command prompts interactively. Piped stdin may provide:
slug, title, description, route, one per line.
`;
}

function readFlagValue(args: string[], index: number, flag: string): [string | undefined, number] {
	const current = args[index];
	const prefix = `${flag}=`;
	if (current.startsWith(prefix)) return [current.slice(prefix.length), index];
	if (current === flag) return [args[index + 1], index + 1];
	return [undefined, index];
}

function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = { slug: '', force: false, help: false, indexable: true };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			options.help = true;
			continue;
		}
		if (arg === '--force') {
			options.force = true;
			continue;
		}
		if (arg === '--indexable') {
			options.indexable = true;
			continue;
		}
		if (arg === '--noindex') {
			options.indexable = false;
			continue;
		}

		let value: string | undefined;
		[value, index] = readFlagValue(args, index, '--slug');
		if (value !== undefined) {
			options.slug = value;
			continue;
		}
		[value, index] = readFlagValue(args, index, '--title');
		if (value !== undefined) {
			options.title = value;
			continue;
		}
		[value, index] = readFlagValue(args, index, '--description');
		if (value !== undefined) {
			options.description = value;
			continue;
		}
		[value, index] = readFlagValue(args, index, '--route');
		if (value !== undefined) {
			options.route = value;
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

async function readPipedLines(): Promise<string[]> {
	const input = createInterface({ input: process.stdin });
	const lines: string[] = [];
	input.on('line', (line) => lines.push(line.trim()));
	await new Promise<void>((resolve) => input.once('close', resolve));
	input.close();
	return lines;
}

async function prompt(question: string, fallback = ''): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const suffix = fallback ? ` [${fallback}]` : '';
	const answer = await new Promise<string>((resolve) => {
		rl.question(`${question}${suffix}: `, (value) => resolve(value.trim() || fallback));
	});
	rl.close();
	return answer;
}

async function resolveInput(options: CliOptions): Promise<CliOptions> {
	if (options.slug) return options;
	if (!process.stdin.isTTY) {
		const [slug = '', title, description, route] = await readPipedLines();
		return { ...options, slug, title, description, route };
	}
	const slug = await prompt('Page slug');
	const title = await prompt('Title');
	const description = await prompt('Description');
	const route = await prompt('Route');
	return { ...options, slug, title, description, route };
}

async function main(): Promise<number> {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.help) {
		console.log(usage());
		return 0;
	}
	const options = await resolveInput(parsed);

	const plan = planPageScaffold(options);
	const result = applyScaffoldPlan(process.cwd(), plan, { force: options.force });
	console.log('scaffold:page complete');
	for (const path of result.writtenFiles) console.log(`  wrote ${path}`);
	for (const path of result.updatedFiles) console.log(`  updated ${path}`);
	for (const path of result.skippedPatches) console.log(`  unchanged ${path}`);
	console.log('');
	console.log('Next:');
	for (const step of plan.nextSteps) console.log(`  - ${step}`);
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(
			`scaffold:page failed: ${error instanceof Error ? error.message : String(error)}`
		);
		process.exit(1);
	});
