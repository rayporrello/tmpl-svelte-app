#!/usr/bin/env bun
import { LAUNCH_TEST_ENV } from './lib/launch-blockers';

for (const [key, value] of Object.entries(LAUNCH_TEST_ENV)) {
	if (process.env[key] !== undefined) continue;
	process.stdout.write(`${key}=${value}\n`);
}
