import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const contactSubmissions = pgTable('contact_submissions', {
	id: uuid('id').defaultRandom().primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	message: text('message').notNull(),
	sourcePath: text('source_path'),
	userAgent: text('user_agent'),
	requestId: text('request_id'),
});

// status: 'pending' | 'processing' | 'completed' | 'failed'
export const automationEvents = pgTable('automation_events', {
	id: uuid('id').defaultRandom().primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	eventType: text('event_type').notNull(),
	payload: jsonb('payload').notNull().default({}),
	status: text('status').notNull().default('pending'),
	attemptCount: integer('attempt_count').notNull().default(0),
	lastError: text('last_error'),
});

export const automationDeadLetters = pgTable('automation_dead_letters', {
	id: uuid('id').defaultRandom().primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	eventType: text('event_type').notNull(),
	payload: jsonb('payload').notNull(),
	error: text('error').notNull(),
});
