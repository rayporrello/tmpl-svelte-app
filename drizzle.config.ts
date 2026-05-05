import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
	throw new Error(
		'[drizzle] DATABASE_DIRECT_URL (host/operator URL) or DATABASE_URL is required. Use DATABASE_DIRECT_URL for production migrations.'
	);
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url },
});
