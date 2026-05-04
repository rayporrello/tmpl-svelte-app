import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { applyScaffoldPlan, planFormScaffold, planPageScaffold } from '../../scripts/lib/scaffold';

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'tmpl-scaffold-'));
	mkdirSync(join(root, 'src/lib/server/db'), { recursive: true });
	mkdirSync(join(root, 'src/lib/server/forms'), { recursive: true });
	mkdirSync(join(root, 'src/lib/seo'), { recursive: true });
	writeFileSync(
		join(root, 'src/lib/server/db/schema.ts'),
		"import { pgTable } from 'drizzle-orm/pg-core';\n\n// FORM SCAFFOLD: source tables go above this line.\n"
	);
	writeFileSync(
		join(root, 'src/lib/server/forms/registry.ts'),
		'export const businessFormRegistry = [\n\t// FORM SCAFFOLD: registry entries go above this line.\n];\n'
	);
	writeFileSync(join(root, 'src/lib/seo/routes.ts'), 'export const routes = [\n];\n');
	return root;
}

describe('scaffold generators', () => {
	it('plans a DB-backed form scaffold with route, schema, table, registry, and SEO updates', () => {
		const plan = planFormScaffold({
			slug: 'idea-box',
			title: 'Idea Box',
			description: 'Send a small project idea.',
		});

		expect(plan.files.map((file) => file.path)).toEqual([
			'src/lib/forms/idea-box.schema.ts',
			'src/routes/idea-box/+page.server.ts',
			'src/routes/idea-box/+page.svelte',
		]);
		expect(plan.patches.map((patch) => patch.path)).toEqual([
			'src/lib/server/db/schema.ts',
			'src/lib/server/forms/registry.ts',
			'src/lib/seo/routes.ts',
		]);
		expect(plan.nextSteps.join(' ')).toContain('bun run db:generate');
	});

	it('applies a form scaffold and refuses to overwrite generated files without force', () => {
		const root = tempRoot();
		try {
			const plan = planFormScaffold({ slug: 'idea-box' });
			const result = applyScaffoldPlan(root, plan);

			expect(result.writtenFiles).toContain('src/lib/forms/idea-box.schema.ts');
			expect(readFileSync(join(root, 'src/lib/server/db/schema.ts'), 'utf8')).toContain(
				"pgTable(\n\t'idea_box_submissions'"
			);
			expect(readFileSync(join(root, 'src/lib/server/forms/registry.ts'), 'utf8')).toContain(
				"id: 'idea-box'"
			);
			expect(() => applyScaffoldPlan(root, plan)).toThrow(/already exists/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('plans a plain page scaffold with SEO route registry wiring', () => {
		const plan = planPageScaffold({
			slug: 'notes',
			title: 'Notes',
			description: 'Short notes and working drafts.',
			indexable: false,
		});

		expect(plan.files).toHaveLength(1);
		expect(plan.files[0].path).toBe('src/routes/notes/+page.svelte');
		expect(plan.files[0].content).toContain("robots: 'noindex, nofollow'");
		expect(plan.patches[0].path).toBe('src/lib/seo/routes.ts');
	});
});
