const userAgent = process.env.npm_config_user_agent ?? '';

if (!userAgent.startsWith('bun/')) {
	console.error('This repository uses Bun. Run `bun install`; do not use npm, pnpm, or yarn.');
	process.exit(1);
}
