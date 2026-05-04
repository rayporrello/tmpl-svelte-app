import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
	throw new Error(
		'[drizzle] DATABASE_URL or DATABASE_DIRECT_URL is required. Set it before running drizzle-kit commands.'
	);
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url },
});
