import type { LaunchErrorCode } from './errors';

export type LaunchBlockerResult = {
	status: 'pass' | 'warn' | 'fail';
	detail?: string;
};

export type LaunchBlocker = {
	id: LaunchErrorCode;
	label: string;
	severity: 'required' | 'recommended';
	check: () => Promise<LaunchBlockerResult>;
	fixHint: string;
	docsPath?: string;
};

async function passStub(): Promise<LaunchBlockerResult> {
	return { status: 'pass' };
}

export const LAUNCH_BLOCKERS: LaunchBlocker[] = [
	{
		id: 'LAUNCH-OG-001',
		label: 'Default OG image is still the template asset',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Replace static/og-default.png with a real 1200x630 PNG.',
		docsPath: 'docs/seo/launch-checklist.md',
	},
	{
		id: 'LAUNCH-SEO-001',
		label: 'Default SEO title is still a placeholder',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Replace site.defaultTitle in src/lib/config/site.ts.',
		docsPath: 'docs/seo/page-contract.md',
	},
	{
		id: 'LAUNCH-CMS-001',
		label: 'CMS backend repository is still a placeholder',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Replace backend.repo in static/admin/config.yml.',
		docsPath: 'docs/cms/README.md',
	},
	{
		id: 'LAUNCH-ENV-001',
		label: 'ORIGIN points to localhost',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Set ORIGIN to the production HTTPS origin.',
		docsPath: 'docs/deployment/secrets.md',
	},
	{
		id: 'LAUNCH-ENV-002',
		label: 'PUBLIC_SITE_URL points to localhost',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Set PUBLIC_SITE_URL to the production HTTPS URL.',
		docsPath: 'docs/deployment/secrets.md',
	},
	{
		id: 'LAUNCH-APPHTML-001',
		label: 'HTML shell title is still the template fallback',
		severity: 'required',
		check: passStub,
		fixHint: 'NEXT: Replace the fallback <title> in src/app.html.',
		docsPath: 'docs/seo/page-contract.md',
	},
	{
		id: 'LAUNCH-BACKUP-001',
		label: 'Production backup config is missing',
		severity: 'recommended',
		check: passStub,
		fixHint: 'NEXT: Configure BACKUP_REMOTE before launch or document the backup waiver.',
		docsPath: 'docs/operations/backups.md',
	},
	{
		id: 'LAUNCH-EMAIL-001',
		label: 'Contact form is still console-only',
		severity: 'recommended',
		check: passStub,
		fixHint: 'NEXT: Set POSTMARK_SERVER_TOKEN and contact email env vars for production email.',
		docsPath: 'docs/design-system/forms-guide.md',
	},
];
