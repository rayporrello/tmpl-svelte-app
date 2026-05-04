import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface ScaffoldFile {
	path: string;
	content: string;
}

export interface ScaffoldPatch {
	path: string;
	needle: string;
	insert: string;
	alreadyPresent: string;
}

export interface ScaffoldPlan {
	files: ScaffoldFile[];
	patches: ScaffoldPatch[];
	nextSteps: string[];
}

export interface FormScaffoldInput {
	slug: string;
	title?: string;
	description?: string;
	route?: string;
	tableName?: string;
	indexable?: boolean;
}

export interface PageScaffoldInput {
	slug: string;
	title?: string;
	description?: string;
	route?: string;
	indexable?: boolean;
}

export interface ApplyScaffoldResult {
	writtenFiles: string[];
	updatedFiles: string[];
	skippedPatches: string[];
}

const FORM_REGISTRY_MARKER = '\t// FORM SCAFFOLD: registry entries go above this line.';
const FORM_TABLE_MARKER = '// FORM SCAFFOLD: source tables go above this line.';

function normalizeSlug(slug: string): string {
	const normalized = slug
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '');
	if (!/^[a-z][a-z0-9-]*$/u.test(normalized)) {
		throw new Error(
			'Slug must start with a letter and contain only letters, numbers, and hyphens.'
		);
	}
	return normalized;
}

function titleFromSlug(slug: string): string {
	return slug
		.split('-')
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(' ');
}

function routeFromSlug(slug: string): string {
	return `/${slug}`;
}

function normalizeRoute(route: string): string {
	const normalized = route.trim().replace(/\/+$/u, '') || '/';
	if (normalized === '/') throw new Error('Scaffolded routes must not target /.');
	if (!/^\/[a-z0-9][a-z0-9/-]*$/u.test(normalized)) {
		throw new Error('Route must use lowercase letters, numbers, hyphens, and slashes.');
	}
	if (normalized.includes('//')) throw new Error('Route must not contain duplicate slashes.');
	return normalized;
}

function snakeFromSlug(slug: string): string {
	return slug.replaceAll('-', '_');
}

function camelFromSlug(slug: string): string {
	const [first = '', ...rest] = slug.split('-');
	return `${first}${rest.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('')}`;
}

function pascalFromSlug(slug: string): string {
	const camel = camelFromSlug(slug);
	return `${camel.slice(0, 1).toUpperCase()}${camel.slice(1)}`;
}

function routeFolder(route: string): string {
	return route.slice(1);
}

function stringLiteral(value: string): string {
	return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/gu, '&amp;')
		.replace(/</gu, '&lt;')
		.replace(/>/gu, '&gt;')
		.replace(/"/gu, '&quot;');
}

function formSchemaTemplate(input: Required<FormScaffoldInput>): string {
	const camel = camelFromSlug(input.slug);
	const pascal = pascalFromSlug(input.slug);
	return `import * as v from 'valibot';

export const ${camel}Schema = v.object({
\t// TODO: Replace these starter fields with the project-specific form contract.
\tname: v.pipe(
\t\tv.string(),
\t\tv.minLength(1, 'Name is required'),
\t\tv.maxLength(100, 'Name must be 100 characters or fewer')
\t),
\temail: v.pipe(
\t\tv.string(),
\t\tv.minLength(1, 'Email is required'),
\t\tv.email('Please enter a valid email address')
\t),
\tmessage: v.pipe(
\t\tv.string(),
\t\tv.minLength(10, 'Message must be at least 10 characters'),
\t\tv.maxLength(2000, 'Message must be 2000 characters or fewer')
\t),
\twebsite: v.optional(v.string(), ''),
});

export type ${pascal}Input = v.InferInput<typeof ${camel}Schema>;
export type ${pascal}Output = v.InferOutput<typeof ${camel}Schema>;
`;
}

function formServerTemplate(input: Required<FormScaffoldInput>): string {
	const camel = camelFromSlug(input.slug);
	const tableVar =
		camelFromSlug(input.tableName.replace(/_submissions$/u, '').replaceAll('_', '-')) +
		'Submissions';
	return `import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import { ${camel}Schema } from '$lib/forms/${input.slug}.schema';
import { enqueueBusinessFormSubmitted } from '$lib/server/automation/events';
import { db } from '$lib/server/db';
import { ${tableVar} } from '$lib/server/db/schema';
import { checkRateLimit } from '$lib/server/forms/rate-limit';
import { resolveEmailProvider } from '$lib/server/forms/providers/index';
import { privateEnv } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

const FORM_ID = ${stringLiteral(input.slug)};
const SOURCE_TABLE = ${stringLiteral(input.tableName)};
const SUCCESS_MESSAGE = 'Thanks — your message was sent.';

export const load: PageServerLoad = async () => {
\treturn { form: await superValidate(valibot(${camel}Schema)) };
};

export const actions: Actions = {
\tdefault: async (event) => {
\t\tconst form = await superValidate(event.request, valibot(${camel}Schema));
\t\tif (!form.valid) return fail(400, { form });

\t\tif (form.data.website && form.data.website.length > 0) {
\t\t\tlogger.info('${input.slug} form honeypot trip', { requestId: event.locals.requestId });
\t\t\treturn message(form, SUCCESS_MESSAGE);
\t\t}

\t\tlet clientKey = \`\${FORM_ID}:unknown\`;
\t\ttry {
\t\t\tclientKey = \`\${FORM_ID}:\${event.getClientAddress()}\`;
\t\t} catch {
\t\t\t// Local dev may not have ADDRESS_HEADER configured.
\t\t}
\t\tif (!checkRateLimit(clientKey)) {
\t\t\treturn message(form, 'Too many requests — please wait a moment before trying again.', {
\t\t\t\tstatus: 429,
\t\t\t});
\t\t}

\t\tconst requestId = event.locals.requestId;
\t\tlet sourcePath: string;
\t\ttry {
\t\t\tconst referer = event.request.headers.get('referer');
\t\t\tsourcePath = referer ? new URL(referer).pathname : event.url.pathname;
\t\t} catch {
\t\t\tsourcePath = event.url.pathname;
\t\t}
\t\tconst userAgent = event.request.headers.get('user-agent');

\t\tlet submissionId: string;
\t\ttry {
\t\t\tsubmissionId = await db.transaction(async (tx) => {
\t\t\t\tconst [inserted] = await tx
\t\t\t\t\t.insert(${tableVar})
\t\t\t\t\t.values({
\t\t\t\t\t\tname: form.data.name,
\t\t\t\t\t\temail: form.data.email,
\t\t\t\t\t\tmessage: form.data.message,
\t\t\t\t\t\tsourcePath,
\t\t\t\t\t\tuserAgent,
\t\t\t\t\t\trequestId,
\t\t\t\t\t})
\t\t\t\t\t.returning({ id: ${tableVar}.id });

\t\t\t\tawait enqueueBusinessFormSubmitted(
\t\t\t\t\t{
\t\t\t\t\t\tformId: FORM_ID,
\t\t\t\t\t\tsubmissionId: inserted.id,
\t\t\t\t\t\tsourceTable: SOURCE_TABLE,
\t\t\t\t\t\tsourcePath,
\t\t\t\t\t\trequestId,
\t\t\t\t\t},
\t\t\t\t\ttx
\t\t\t\t);

\t\t\t\treturn inserted.id;
\t\t\t});
\t\t} catch (err) {
\t\t\tlogger.error('${input.slug} form DB/outbox transaction failed', {
\t\t\t\terror: String(err),
\t\t\t\trequestId,
\t\t\t});
\t\t\treturn message(form, 'Something went wrong — please try again later.', { status: 500 });
\t\t}

\t\t// TODO: Customize or remove this notification once the project-specific workflow is known.
\t\ttry {
\t\t\tawait resolveEmailProvider().send({
\t\t\t\tto: privateEnv.CONTACT_TO_EMAIL ?? 'hello@example.com',
\t\t\t\tfrom: privateEnv.CONTACT_FROM_EMAIL ?? 'noreply@example.com',
\t\t\t\tsubject: ${stringLiteral(input.title)} + \`: \${form.data.name}\`,
\t\t\t\ttext: \`Name: \${form.data.name}\\nEmail: \${form.data.email}\\n\\n\${form.data.message}\`,
\t\t\t\treplyTo: form.data.email,
\t\t\t});
\t\t} catch (err) {
\t\t\tlogger.error('${input.slug} form email failed', {
\t\t\t\terror: String(err),
\t\t\t\tsubmissionId,
\t\t\t\trequestId,
\t\t\t});
\t\t}

\t\treturn message(form, SUCCESS_MESSAGE);
\t},
};
`;
}

function formPageTemplate(input: Required<FormScaffoldInput>): string {
	const camel = camelFromSlug(input.slug);
	const robots = input.indexable ? '' : "\n\t\trobots: 'noindex, nofollow',";
	return `<script lang="ts">
\timport { untrack } from 'svelte';
\timport SEO from '$lib/components/seo/SEO.svelte';
\timport Section from '$lib/components/Section.svelte';
\timport { superForm } from 'sveltekit-superforms';
\timport type { PageData } from './$types';

\tlet { data }: { data: PageData } = $props();

\tconst { form, errors, enhance, message, delayed, submitting } = superForm(
\t\tuntrack(() => data.form),
\t\t{ resetForm: true }
\t);
</script>

<SEO
\tseo={{
\t\ttitle: ${stringLiteral(input.title)},
\t\tdescription: ${stringLiteral(input.description)},
\t\tcanonicalPath: ${stringLiteral(input.route)},${robots}
\t}}
/>

<Section id="${input.slug}" width="narrow">
\t<header class="form-intro">
\t\t<h1>${escapeHtml(input.title)}</h1>
\t\t<p class="text-secondary">${escapeHtml(input.description)}</p>
\t</header>

\t{#if $message}
\t\t<div class="form-message" data-variant={$message.startsWith('Thanks') ? 'success' : 'danger'}>
\t\t\t{$message}
\t\t</div>
\t{/if}

\t<form class="form" method="POST" use:enhance>
\t\t<div class="honeypot" aria-hidden="true">
\t\t\t<label>
\t\t\t\tWebsite
\t\t\t\t<input
\t\t\t\t\ttype="text"
\t\t\t\t\tname="website"
\t\t\t\t\ttabindex="-1"
\t\t\t\t\tautocomplete="off"
\t\t\t\t\tbind:value={$form.website}
\t\t\t\t/>
\t\t\t</label>
\t\t</div>

\t\t{#if $errors._errors}
\t\t\t<div class="form-message" data-variant="danger">
\t\t\t\t{$errors._errors.join(', ')}
\t\t\t</div>
\t\t{/if}

\t\t<div class="field" data-invalid={$errors.name ? 'true' : undefined}>
\t\t\t<label class="field-label" for="${camel}-name">
\t\t\t\tName
\t\t\t\t<span class="field-required" aria-hidden="true">*</span>
\t\t\t</label>
\t\t\t<input
\t\t\t\tid="${camel}-name"
\t\t\t\tname="name"
\t\t\t\tclass="input"
\t\t\t\ttype="text"
\t\t\t\tautocomplete="name"
\t\t\t\tbind:value={$form.name}
\t\t\t\taria-invalid={$errors.name ? 'true' : undefined}
\t\t\t\taria-describedby={$errors.name ? '${camel}-name-error' : undefined}
\t\t\t/>
\t\t\t{#if $errors.name}
\t\t\t\t<p class="field-error" id="${camel}-name-error">{$errors.name}</p>
\t\t\t{/if}
\t\t</div>

\t\t<div class="field" data-invalid={$errors.email ? 'true' : undefined}>
\t\t\t<label class="field-label" for="${camel}-email">
\t\t\t\tEmail
\t\t\t\t<span class="field-required" aria-hidden="true">*</span>
\t\t\t</label>
\t\t\t<input
\t\t\t\tid="${camel}-email"
\t\t\t\tname="email"
\t\t\t\tclass="input"
\t\t\t\ttype="email"
\t\t\t\tautocomplete="email"
\t\t\t\tbind:value={$form.email}
\t\t\t\taria-invalid={$errors.email ? 'true' : undefined}
\t\t\t\taria-describedby={$errors.email ? '${camel}-email-error' : undefined}
\t\t\t/>
\t\t\t{#if $errors.email}
\t\t\t\t<p class="field-error" id="${camel}-email-error">{$errors.email}</p>
\t\t\t{/if}
\t\t</div>

\t\t<div class="field" data-invalid={$errors.message ? 'true' : undefined}>
\t\t\t<label class="field-label" for="${camel}-message">
\t\t\t\tMessage
\t\t\t\t<span class="field-required" aria-hidden="true">*</span>
\t\t\t</label>
\t\t\t<textarea
\t\t\t\tid="${camel}-message"
\t\t\t\tname="message"
\t\t\t\tclass="textarea"
\t\t\t\trows="6"
\t\t\t\tbind:value={$form.message}
\t\t\t\taria-invalid={$errors.message ? 'true' : undefined}
\t\t\t\taria-describedby={$errors.message ? '${camel}-message-error' : undefined}
\t\t\t></textarea>
\t\t\t{#if $errors.message}
\t\t\t\t<p class="field-error" id="${camel}-message-error">{$errors.message}</p>
\t\t\t{/if}
\t\t</div>

\t\t<div class="form-actions">
\t\t\t<button type="submit" disabled={$submitting || $delayed}>
\t\t\t\t{$delayed ? 'Sending…' : 'Send'}
\t\t\t</button>
\t\t</div>
\t</form>
</Section>

<style>
\t.form-intro {
\t\tdisplay: flex;
\t\tflex-direction: column;
\t\tgap: var(--space-2);
\t\tmargin-block-end: var(--space-6);
\t}

\t.honeypot {
\t\tposition: absolute;
\t\tinline-size: 1px;
\t\tblock-size: 1px;
\t\tmargin: -1px;
\t\tpadding: 0;
\t\tborder: 0;
\t\toverflow: hidden;
\t\tclip: rect(0 0 0 0);
\t\tclip-path: inset(50%);
\t\twhite-space: nowrap;
\t}
</style>
`;
}

function tableSnippet(input: Required<FormScaffoldInput>): string {
	const tableVar =
		camelFromSlug(input.tableName.replace(/_submissions$/u, '').replaceAll('_', '-')) +
		'Submissions';
	return `export const ${tableVar} = pgTable(
\t${stringLiteral(input.tableName)},
\t{
\t\tid: uuid('id').defaultRandom().primaryKey(),
\t\tcreatedAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
\t\t// TODO: Replace these starter fields with the project-specific storage contract.
\t\tname: text('name').notNull(),
\t\temail: text('email').notNull(),
\t\tmessage: text('message').notNull(),
\t\tsourcePath: text('source_path'),
\t\tuserAgent: text('user_agent'),
\t\trequestId: text('request_id'),
\t},
\t(table) => [index('${input.tableName}_created_at_idx').on(table.createdAt)]
);

`;
}

function registrySnippet(input: Required<FormScaffoldInput>): string {
	return `\t{
\t\tid: ${stringLiteral(input.slug)},
\t\tlabel: ${stringLiteral(input.title)},
\t\tdescription: ${stringLiteral(input.description)},
\t\troute: ${stringLiteral(input.route)},
\t\tschemaPath: 'src/lib/forms/${input.slug}.schema.ts',
\t\tserverRoutePath: 'src/routes/${routeFolder(input.route)}/+page.server.ts',
\t\tclientRoutePath: 'src/routes/${routeFolder(input.route)}/+page.svelte',
\t\tsourceTable: ${stringLiteral(input.tableName)},
\t\toutboxEvent: 'business_form.submitted',
\t\tstoresPii: true,
\t\tpiiClassification: 'contact',
\t\tpiiFields: ['name', 'email', 'message', 'user_agent'],
\t\tretentionPolicy: 'businessFormSubmissions',
\t\tretentionDays: RETENTION_DEFAULTS_DAYS.businessFormSubmissions,
\t\tdocsPath: 'docs/forms/README.md',
\t\tinspection: [
\t\t\t'bun run forms:ops -- list --form=${input.slug}',
\t\t\t'bun run forms:ops -- inspect --form=${input.slug} --id=<submission-id>',
\t\t],
\t},
`;
}

function routeRegistrySnippet(input: Required<PageScaffoldInput>): string {
	return `\t{
\t\tpath: ${stringLiteral(input.route)},
\t\ttitle: ${stringLiteral(input.title)},
\t\tdescription: ${stringLiteral(input.description)},
\t\tindexable: ${input.indexable ? 'true' : 'false'},
\t\tchangefreq: 'yearly',
\t\tpriority: ${input.indexable ? '0.5' : '0.3'},
\t},
`;
}

export function normalizeFormInput(input: FormScaffoldInput): Required<FormScaffoldInput> {
	const slug = normalizeSlug(input.slug);
	const route = normalizeRoute(input.route ?? routeFromSlug(slug));
	const title = input.title?.trim() || titleFromSlug(slug);
	const description = input.description?.trim() || `A focused ${title.toLowerCase()} form.`;
	const tableName = input.tableName?.trim() || `${snakeFromSlug(slug)}_submissions`;
	if (!/^[a-z][a-z0-9_]*$/u.test(tableName)) {
		throw new Error('Table name must be snake_case and start with a letter.');
	}
	return {
		slug,
		title,
		description,
		route,
		tableName,
		indexable: input.indexable ?? true,
	};
}

export function normalizePageInput(input: PageScaffoldInput): Required<PageScaffoldInput> {
	const slug = normalizeSlug(input.slug);
	const route = normalizeRoute(input.route ?? routeFromSlug(slug));
	const title = input.title?.trim() || titleFromSlug(slug);
	const description = input.description?.trim() || `A focused ${title.toLowerCase()} page.`;
	return {
		slug,
		title,
		description,
		route,
		indexable: input.indexable ?? true,
	};
}

export function planFormScaffold(input: FormScaffoldInput): ScaffoldPlan {
	const form = normalizeFormInput(input);
	const routeDir = routeFolder(form.route);
	return {
		files: [
			{ path: `src/lib/forms/${form.slug}.schema.ts`, content: formSchemaTemplate(form) },
			{ path: `src/routes/${routeDir}/+page.server.ts`, content: formServerTemplate(form) },
			{ path: `src/routes/${routeDir}/+page.svelte`, content: formPageTemplate(form) },
		],
		patches: [
			{
				path: 'src/lib/server/db/schema.ts',
				needle: FORM_TABLE_MARKER,
				insert: tableSnippet(form),
				alreadyPresent: `pgTable(\n\t${stringLiteral(form.tableName)}`,
			},
			{
				path: 'src/lib/server/forms/registry.ts',
				needle: FORM_REGISTRY_MARKER,
				insert: registrySnippet(form),
				alreadyPresent: `id: ${stringLiteral(form.slug)}`,
			},
			{
				path: 'src/lib/seo/routes.ts',
				needle: '];',
				insert: routeRegistrySnippet(form),
				alreadyPresent: `path: ${stringLiteral(form.route)}`,
			},
		],
		nextSteps: [
			'Review the generated schema/table fields and source copy.',
			'Run bun run db:generate, then bun run db:migrate against the target database.',
			'Run bun run forms:check && bun run routes:check && bun run check.',
		],
	};
}

function pageTemplate(input: Required<PageScaffoldInput>): string {
	const robots = input.indexable ? '' : "\n\t\trobots: 'noindex, nofollow',";
	return `<script lang="ts">
\timport SEO from '$lib/components/seo/SEO.svelte';
\timport Section from '$lib/components/Section.svelte';
</script>

<SEO
\tseo={{
\t\ttitle: ${stringLiteral(input.title)},
\t\tdescription: ${stringLiteral(input.description)},
\t\tcanonicalPath: ${stringLiteral(input.route)},${robots}
\t}}
/>

<Section id="${input.slug}" width="narrow">
\t<article class="page-copy">
\t\t<h1>${escapeHtml(input.title)}</h1>
\t\t<p class="text-secondary">${escapeHtml(input.description)}</p>

\t\t<h2>Draft Section</h2>
\t\t<p>This page is ready for project-specific copy.</p>
\t</article>
</Section>

<style>
\t.page-copy {
\t\tdisplay: flex;
\t\tflex-direction: column;
\t\tgap: var(--space-4);
\t}

\t.page-copy h2 {
\t\tmargin-block-start: var(--space-6);
\t}
</style>
`;
}

export function planPageScaffold(input: PageScaffoldInput): ScaffoldPlan {
	const page = normalizePageInput(input);
	const routeDir = routeFolder(page.route);
	return {
		files: [{ path: `src/routes/${routeDir}/+page.svelte`, content: pageTemplate(page) }],
		patches: [
			{
				path: 'src/lib/seo/routes.ts',
				needle: '];',
				insert: routeRegistrySnippet(page),
				alreadyPresent: `path: ${stringLiteral(page.route)}`,
			},
		],
		nextSteps: ['Customize the page copy.', 'Run bun run routes:check && bun run check:seo.'],
	};
}

export function applyScaffoldPlan(
	rootDir: string,
	plan: ScaffoldPlan,
	options: { force?: boolean } = {}
): ApplyScaffoldResult {
	const root = resolve(rootDir);
	const writtenFiles: string[] = [];
	const updatedFiles: string[] = [];
	const skippedPatches: string[] = [];

	for (const file of plan.files) {
		const abs = join(root, file.path);
		if (existsSync(abs) && !options.force) {
			throw new Error(`${file.path} already exists. Pass --force to overwrite scaffolded files.`);
		}
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, file.content);
		writtenFiles.push(file.path);
	}

	for (const patch of plan.patches) {
		const abs = join(root, patch.path);
		if (!existsSync(abs)) throw new Error(`${patch.path} does not exist.`);
		const current = readFileSync(abs, 'utf8');
		if (current.includes(patch.alreadyPresent)) {
			skippedPatches.push(patch.path);
			continue;
		}
		if (!current.includes(patch.needle)) {
			throw new Error(`${patch.path} is missing scaffold marker: ${patch.needle}`);
		}
		writeFileSync(abs, current.replace(patch.needle, `${patch.insert}${patch.needle}`));
		updatedFiles.push(patch.path);
	}

	return { writtenFiles, updatedFiles, skippedPatches };
}
