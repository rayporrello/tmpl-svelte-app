/**
 * Validates static/admin/config.yml for Sveltia CMS safety rules.
 * Exits 0 when the file is absent (pre-Phase 3) or passes all checks.
 * Exits 1 on any violation with actionable messages.
 */

import { readFileSync, existsSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { contentSchemas } from '../src/lib/content/schemas';

const CONFIG_PATH = 'static/admin/config.yml';
const APPROVED_CONTENT_DIRS = ['content/', 'src/content/'];

// Optional datetime allowlist: add field names here to permit them per project.
const OPTIONAL_DATETIME_ALLOWLIST: string[] = ['modified_date'];

let errors = 0;
let warnings = 0;

function fail(msg: string): void {
	console.error(`[FAIL] ${msg}`);
	errors++;
}

function warn(msg: string): void {
	console.warn(`[WARN] ${msg}`);
	warnings++;
}

// ── Config file presence ────────────────────────────────────────────────────

if (!existsSync(CONFIG_PATH)) {
	console.log(`[INFO] ${CONFIG_PATH} not found — CMS not yet configured. Skipping checks.`);
	process.exit(0);
}

// ── Parse config ────────────────────────────────────────────────────────────

let config: Record<string, unknown>;
try {
	const raw = readFileSync(CONFIG_PATH, 'utf-8');
	config = yamlLoad(raw) as Record<string, unknown>;
} catch (err) {
	fail(`Failed to parse ${CONFIG_PATH}: ${String(err)}`);
	process.exit(1);
}

// ── media_folder / public_folder ────────────────────────────────────────────

const mediaFolder = config['media_folder'] as string | undefined;
const publicFolder = config['public_folder'] as string | undefined;

if (!mediaFolder) {
	fail('media_folder is missing from config.yml. Add: media_folder: static/uploads');
} else if (!mediaFolder.startsWith('static/')) {
	warn(
		`media_folder "${mediaFolder}" does not start with "static/". Uploads may not be served correctly.`
	);
}

if (!publicFolder) {
	fail('public_folder is missing from config.yml. Add: public_folder: /uploads');
} else if (!publicFolder.startsWith('/')) {
	fail(`public_folder "${publicFolder}" must start with "/" for correct URL resolution.`);
}

// ── Collections ─────────────────────────────────────────────────────────────

const collections = (config['collections'] as unknown[]) ?? [];

if (collections.length === 0) {
	warn('No collections defined in config.yml.');
}

for (const collection of collections) {
	const col = collection as Record<string, unknown>;
	const colName = String(col['name'] ?? '(unnamed)');
	const colLabel = String(col['label'] ?? colName);

	// ── Format check ─────────────────────────────────────────────────────────

	const format = col['format'] as string | undefined;
	if (format === 'toml-frontmatter') {
		fail(
			`Collection "${colLabel}" uses toml-frontmatter. ` +
				`Use yaml-frontmatter or frontmatter instead.`
		);
	}

	// ── Folder path check ────────────────────────────────────────────────────

	const folder = col['folder'] as string | undefined;
	if (folder) {
		const approved = APPROVED_CONTENT_DIRS.some((dir) => folder.startsWith(dir));
		if (!approved) {
			fail(
				`Collection "${colLabel}" folder "${folder}" is outside approved content directories. ` +
					`Approved: ${APPROVED_CONTENT_DIRS.join(', ')}`
			);
		}
	}

	// ── Check file-based collections ─────────────────────────────────────────

	const files = (col['files'] as unknown[]) ?? [];
	for (const file of files) {
		const f = file as Record<string, unknown>;
		const fileName = String(f['name'] ?? '(unnamed file)');
		const fileFormat = f['format'] as string | undefined;
		if (fileFormat === 'toml-frontmatter') {
			fail(
				`Collection "${colLabel}" > file "${fileName}" uses toml-frontmatter. ` +
					`Use yaml or frontmatter instead.`
			);
		}
		checkFields(colLabel, fileName, (f['fields'] as unknown[]) ?? []);
		if (colName === 'pages' && fileName === 'home') {
			checkCmsFieldsAgainstSchema(
				`${colLabel} > ${fileName}`,
				(f['fields'] as unknown[]) ?? [],
				contentSchemas.pages.home
			);
		}
	}

	// ── Field-level checks ────────────────────────────────────────────────────

	const topFields = (col['fields'] as unknown[]) ?? [];
	checkFields(colLabel, null, topFields);
	if (colName === 'articles') {
		checkCmsFieldsAgainstSchema(colLabel, topFields, contentSchemas.articles);
	}
	if (colName === 'team') {
		checkCmsFieldsAgainstSchema(colLabel, topFields, contentSchemas.team);
	}
	if (colName === 'testimonials') {
		checkCmsFieldsAgainstSchema(colLabel, topFields, contentSchemas.testimonials);
	}

	// ── Canonical collection required fields ─────────────────────────────────

	if (colName === 'pages') {
		const allFileFields = files.flatMap((f) => {
			const file = f as Record<string, unknown>;
			return (file['fields'] as unknown[]) ?? [];
		});
		checkCanonicalFields(colLabel, allFileFields, ['title', 'description']);
	}

	if (colName === 'posts' || colName === 'articles') {
		const required = ['title', 'description'];
		checkCanonicalFields(colLabel, topFields, required);
	}
}

interface ContractField {
	path: string;
	required: boolean;
}

function isSchemaOptional(schema: Record<string, unknown>): boolean {
	return (
		schema['type'] === 'optional' ||
		schema['type'] === 'exact_optional' ||
		schema['type'] === 'nullish'
	);
}

function unwrapOptional(schema: Record<string, unknown>): Record<string, unknown> {
	return isSchemaOptional(schema) ? (schema['wrapped'] as Record<string, unknown>) : schema;
}

function flattenSchemaFields(
	schemaInput: unknown,
	prefix = '',
	parentRequired = true
): ContractField[] {
	const schema = schemaInput as Record<string, unknown>;
	const optional = isSchemaOptional(schema);
	const unwrapped = unwrapOptional(schema);
	const required = parentRequired && !optional;
	const fields: ContractField[] = [];

	if (prefix) fields.push({ path: prefix, required });

	const entries = unwrapped['entries'] as Record<string, unknown> | undefined;
	if (entries) {
		for (const [key, child] of Object.entries(entries)) {
			fields.push(...flattenSchemaFields(child, prefix ? `${prefix}.${key}` : key, required));
		}
		return fields;
	}

	if (unwrapped['type'] === 'array') {
		const item = unwrapped['item'];
		if (item) fields.push(...flattenSchemaFields(item, `${prefix}[]`, required));
	}

	return fields;
}

function flattenCmsFields(
	fieldsInput: unknown[],
	prefix = '',
	parentRequired = true
): ContractField[] {
	const fields: ContractField[] = [];

	for (const fieldInput of fieldsInput) {
		const field = fieldInput as Record<string, unknown>;
		const name = String(field['name'] ?? '');
		if (!name) continue;
		const path = prefix ? `${prefix}.${name}` : name;
		const required = parentRequired && field['required'] !== false;
		fields.push({ path, required });

		const subFields = (field['fields'] as unknown[]) ?? [];
		if (subFields.length === 0) continue;
		const widget = field['widget'];
		const childPrefix = widget === 'list' ? `${path}[]` : path;
		fields.push(...flattenCmsFields(subFields, childPrefix, required));
	}

	return fields;
}

function checkCmsFieldsAgainstSchema(
	location: string,
	cmsFieldsInput: unknown[],
	schema: unknown
): void {
	const cmsFields = flattenCmsFields(cmsFieldsInput);
	const schemaFields = flattenSchemaFields(schema);
	const cmsPaths = new Set(cmsFields.map((field) => field.path));
	const schemaPaths = new Set(schemaFields.map((field) => field.path));

	for (const field of cmsFields) {
		if (!schemaPaths.has(field.path)) {
			fail(
				`Collection "${location}" exposes field "${field.path}" but src/lib/content/schemas.ts does not define it.`
			);
		}
	}

	for (const field of schemaFields) {
		if (field.required && !cmsPaths.has(field.path)) {
			fail(
				`Collection "${location}" is missing schema-required field "${field.path}" from static/admin/config.yml.`
			);
		}
	}
}

function checkFields(collectionLabel: string, fileLabel: string | null, fields: unknown[]): void {
	const location = fileLabel ? `${collectionLabel} > ${fileLabel}` : collectionLabel;

	// Duplicate field names
	const names = fields.map((f) => String((f as Record<string, unknown>)['name'] ?? ''));
	const seen = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			fail(`Collection "${location}" has duplicate field name "${name}".`);
		}
		seen.add(name);
	}

	// Optional datetime fields
	for (const field of fields) {
		const f = field as Record<string, unknown>;
		const widget = f['widget'] as string | undefined;
		const fieldName = String(f['name'] ?? '(unnamed)');
		const required = f['required'] as boolean | undefined;

		if (widget === 'datetime' && required === false) {
			if (OPTIONAL_DATETIME_ALLOWLIST.includes(fieldName)) {
				continue;
			} else {
				fail(
					`Collection "${location}" field "${fieldName}" is an optional datetime. ` +
						`Optional datetime fields are forbidden by default. ` +
						`Add to OPTIONAL_DATETIME_ALLOWLIST in scripts/check-cms-config.ts if intentional, ` +
						`then validate that empty values are omitted in content files.`
				);
			}
		}

		// Recurse into object and list fields
		const subFields = (f['fields'] as unknown[]) ?? [];
		if (subFields.length > 0) {
			checkFields(`${location} > ${fieldName}`, null, subFields);
		}
	}
}

function checkCanonicalFields(
	collectionLabel: string,
	fields: unknown[],
	requiredNames: string[]
): void {
	const fieldNames = new Set(
		fields.map((f) => String((f as Record<string, unknown>)['name'] ?? ''))
	);
	for (const required of requiredNames) {
		if (!fieldNames.has(required)) {
			fail(
				`Collection "${collectionLabel}" is missing required field "${required}". ` +
					`Add it to the collection fields in config.yml.`
			);
		}
	}
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('');
if (errors > 0) {
	console.error(`CMS config check: ${errors} error(s), ${warnings} warning(s). Fix errors above.`);
	process.exit(1);
} else if (warnings > 0) {
	console.log(`CMS config check passed with ${warnings} warning(s). Review warnings above.`);
} else {
	console.log('CMS config check passed.');
}
