import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	jsonb,
	index,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

export const contactSubmissions = pgTable(
	'contact_submissions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		message: text('message').notNull(),
		sourcePath: text('source_path'),
		userAgent: text('user_agent'),
		requestId: text('request_id'),
	},
	(table) => [index('contact_submissions_created_at_idx').on(table.createdAt)]
);

// FORM SCAFFOLD: source tables go above this line.

// status: 'pending' | 'processing' | 'completed' | 'failed'
export const automationEvents = pgTable(
	'automation_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		eventType: text('event_type').notNull(),
		payload: jsonb('payload').notNull().default({}),
		status: text('status').notNull().default('pending'),
		attemptCount: integer('attempt_count').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
		lockedAt: timestamp('locked_at', { withTimezone: true }),
		lockedBy: text('locked_by'),
		idempotencyKey: text('idempotency_key').notNull(),
		lastError: text('last_error'),
	},
	(table) => [
		index('automation_events_status_created_at_idx').on(table.status, table.createdAt),
		index('automation_events_ready_idx').on(table.status, table.nextAttemptAt, table.createdAt),
		uniqueIndex('automation_events_idempotency_key_idx').on(table.idempotencyKey),
	]
);

export const automationDeadLetters = pgTable(
	'automation_dead_letters',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		eventId: uuid('event_id').references(() => automationEvents.id, { onDelete: 'set null' }),
		eventType: text('event_type').notNull(),
		error: text('error').notNull(),
	},
	(table) => [index('automation_dead_letters_created_at_idx').on(table.createdAt)]
);
