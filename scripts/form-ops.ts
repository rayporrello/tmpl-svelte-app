#!/usr/bin/env bun
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';
import {
	inspectFormSubmission,
	listDeadLetters,
	listFormSubmissions,
	listPendingAutomationEvents,
	parseFormOpsArgs,
	requeueDeadLetter,
	usage,
} from './lib/form-ops';

function printJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}

async function main(argv = process.argv.slice(2)): Promise<number> {
	const args = parseFormOpsArgs(argv);
	if (args.command === 'help') {
		console.log(usage());
		return 0;
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

	const sql = postgres(databaseUrl, { max: 2, connect_timeout: 10 });
	try {
		if (args.command === 'list') {
			printJson(
				await listFormSubmissions(sql, args.formId!, {
					limit: args.limit,
					showPii: args.showPii,
				})
			);
			return 0;
		}

		if (args.command === 'inspect') {
			const row = await inspectFormSubmission(sql, args.formId!, args.id!, {
				showPii: args.showPii,
			});
			if (!row) {
				console.error(`No ${args.formId} submission found for id ${args.id}.`);
				return 1;
			}
			printJson(row);
			return 0;
		}

		if (args.command === 'automation:pending') {
			printJson(await listPendingAutomationEvents(sql, args.limit));
			return 0;
		}

		if (args.command === 'dead-letters') {
			printJson(await listDeadLetters(sql, args.limit));
			return 0;
		}

		if (args.command === 'dead-letter:requeue') {
			const row = await requeueDeadLetter(sql, args.id!);
			printJson({
				requeued: row,
				next: 'Run bun run automation:worker to retry delivery.',
			});
			return 0;
		}

		throw new Error(`Unhandled command: ${args.command}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`forms:ops failed. Check DATABASE_URL and database connectivity. ${message}`, {
			cause: error,
		});
	} finally {
		await sql.end();
	}
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedFile === currentFile) {
	main()
		.then((code) => process.exit(code))
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
