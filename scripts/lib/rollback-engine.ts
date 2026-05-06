import { basename, join, parse } from 'node:path';

import { fail, info, type OpsResult } from './ops-result';
import { appendEvent } from './ops-status';
import { parseQuadletImage, replaceQuadletImage } from './quadlet-image';
import { ROLLBACK_QUADLETS } from './quadlets';
import {
	getCurrentRelease,
	getPreviousRollbackSafeRelease,
	listReleases,
	type Release,
} from './release-state';

export interface RollbackPlan {
	current: Release;
	target: Release;
	quadletUpdates: Array<{
		path: string;
		oldImage: string;
		newImage: string;
		unitName: string;
	}>;
}

function unitNameFor(quadletFilename: string): string {
	return `${parse(basename(quadletFilename)).name}.service`;
}

function refusalReason(): string {
	const previous = listReleases().slice(1);
	return previous.length === 0
		? 'no prior release on record'
		: 'previous release marked rollback-blocked';
}

function releaseLabel(release: Release): string {
	return `${release.id} (${release.sha})`;
}

export function planRollback(opts: { deployQuadletsDir?: string } = {}): {
	plan: RollbackPlan | null;
	results: OpsResult[];
} {
	const current = getCurrentRelease();
	if (!current) {
		return {
			plan: null,
			results: [
				fail('ROLLBACK-PLAN-001', 'Rollback refused: no releases on record', {
					detail:
						'The releases ledger is empty, so there is no current release and no rollback target.',
					runbook: 'docs/operations/rollback.md',
				}),
			],
		};
	}

	const target = getPreviousRollbackSafeRelease();
	if (!target) {
		const reason = refusalReason();
		return {
			plan: null,
			results: [
				fail('ROLLBACK-PLAN-002', `Rollback refused: ${reason}`, {
					detail: `Current release: ${releaseLabel(current)}. Rollback only supports --to previous when a prior release is marked rollback-safe.`,
					runbook: 'docs/operations/rollback.md',
				}),
			],
		};
	}

	const deployQuadletsDir = opts.deployQuadletsDir ?? join('deploy', 'quadlets');
	const quadletUpdates = ROLLBACK_QUADLETS.map((entry) => {
		const path = join(deployQuadletsDir, entry);
		return {
			path,
			oldImage: parseQuadletImage(path).imageRef,
			newImage: target.image,
			unitName: unitNameFor(entry),
		};
	});

	return {
		plan: { current, target, quadletUpdates },
		results: [
			info('ROLLBACK-PLAN-003', 'Rollback plan ready', {
				detail: [
					`Current release: ${releaseLabel(current)} -> ${current.image}`,
					`Target release: ${releaseLabel(target)} -> ${target.image}`,
					`Quadlets: ${quadletUpdates.map((update) => update.path).join(', ')}`,
				].join('\n'),
				runbook: 'docs/operations/rollback.md',
			}),
		],
	};
}

export function describeRollbackStatus(): OpsResult[] {
	const current = getCurrentRelease();
	if (!current) {
		return [
			info('ROLLBACK-STATUS-001', 'No releases on record', {
				detail:
					'The releases ledger is empty. Rollback cannot be planned until a release is recorded.',
				runbook: 'docs/operations/rollback.md',
			}),
		];
	}

	const target = getPreviousRollbackSafeRelease();
	if (!target) {
		return [
			info('ROLLBACK-STATUS-002', 'Current release has no rollback-safe candidate', {
				detail: [
					`Current release: ${releaseLabel(current)} -> ${current.image}`,
					`Candidate: ${refusalReason()}`,
				].join('\n'),
				runbook: 'docs/operations/rollback.md',
			}),
		];
	}

	return [
		info('ROLLBACK-STATUS-003', 'Rollback-safe candidate found', {
			detail: [
				`Current release: ${releaseLabel(current)} -> ${current.image}`,
				`Candidate: ${releaseLabel(target)} -> ${target.image}`,
			].join('\n'),
			runbook: 'docs/operations/rollback.md',
		}),
	];
}

export function applyRollback(plan: RollbackPlan, opts: { dryRun?: boolean } = {}): OpsResult[] {
	const dryRun = opts.dryRun === true;
	const results: OpsResult[] = [];

	for (const update of plan.quadletUpdates) {
		const replacement = replaceQuadletImage(update.path, update.newImage, { dryRun });
		results.push(
			info(
				dryRun ? 'ROLLBACK-APPLY-DRY-RUN-001' : 'ROLLBACK-APPLY-001',
				`${dryRun ? 'Would update' : 'Updated'} ${update.path}`,
				{
					detail: `${replacement.oldRef} -> ${update.newImage}`,
				}
			)
		);
	}

	if (!dryRun) {
		const timestamp = new Date().toISOString();
		appendEvent({
			channel: 'releases',
			type: 'rollback',
			timestamp,
			from_release: plan.current,
			to_release: plan.target,
			quadlet_paths: plan.quadletUpdates.map((update) => update.path),
			actor: process.env.USER?.trim() || 'unknown',
		});
	}

	results.push(
		info('ROLLBACK-APPLY-002', dryRun ? 'Rollback dry-run complete' : 'Rollback files updated', {
			detail: dryRun
				? 'No Quadlet files were written and no ledger event was appended.'
				: 'Quadlet files were written. Run these commands on the host to reload and restart the affected units.',
			remediation: [
				'systemctl --user daemon-reload',
				`systemctl --user restart ${plan.quadletUpdates
					.map((update) => update.unitName)
					.join(' ')}`,
			],
			runbook: 'docs/operations/rollback.md',
		})
	);

	return results;
}
