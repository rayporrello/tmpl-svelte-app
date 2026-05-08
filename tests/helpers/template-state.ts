import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PACKAGE_NAME = 'tmpl-svelte-app';

export const inTemplateState: boolean = (() => {
	try {
		const pkg = JSON.parse(
			readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')
		) as { name?: unknown };
		return pkg.name === TEMPLATE_PACKAGE_NAME;
	} catch {
		return false;
	}
})();
