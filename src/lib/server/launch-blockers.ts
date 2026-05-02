import {
	evaluateLaunchBlockers,
	type LaunchBlockerSeverity,
} from '../../../scripts/lib/launch-blockers';

export type DevSetupWarning = {
	id: string;
	label: string;
	severity: LaunchBlockerSeverity;
	fixHint: string;
};

export async function getDevSetupWarnings(
	options: { rootDir?: string } = {}
): Promise<DevSetupWarning[]> {
	const results = await evaluateLaunchBlockers({
		rootDir: options.rootDir ?? process.cwd(),
		envSource: 'dev',
	});

	return results
		.filter((result) => result.status !== 'pass')
		.map((result) => ({
			id: result.id,
			label: result.label,
			severity: result.severity,
			fixHint: result.fixHint,
		}));
}
