import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// DATABASE_URL is validated by initEnv() in hooks.server.ts before any route
// handler runs. This module is only imported when a route that needs the DB
// is first accessed, so the env var is guaranteed to be set by then.
const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
