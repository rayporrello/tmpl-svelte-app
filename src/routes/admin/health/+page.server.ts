import {
	readDbLiveFacts,
	readLedgerFacts,
	summarize,
	type DbHandle,
	type HealthFacts,
} from '../../../../scripts/lib/health-engine';

export const _loadAdminHealthData = async (opts: { db?: DbHandle } = {}) => {
	const ledger = readLedgerFacts();
	const dbLive = await readDbLiveFacts({ db: opts.db });
	const merged: HealthFacts = {
		currentRelease: ledger.facts.currentRelease,
		previousRelease: ledger.facts.previousRelease,
		backup: ledger.facts.backup,
		drill: ledger.facts.drill,
		recentEvents: ledger.facts.recentEvents,
		...dbLive.facts,
	};
	const results = [...ledger.results, ...dbLive.results];

	return {
		results,
		summary: summarize(merged, results),
	};
};

export const load = async () => _loadAdminHealthData();
