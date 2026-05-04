// Production entrypoint for the Bun container.
//
// svelte-adapter-bun's build/index.js calls Bun.serve() directly with no
// signal handlers. SIGTERM (sent by Quadlet/Podman on rolling restart) would
// otherwise terminate the process immediately, truncating in-flight HTTP
// responses and dropping postgres connections mid-query.
//
// This wrapper registers SIGTERM/SIGINT handlers that delay process exit by
// SHUTDOWN_TIMEOUT_MS (default 8s). Caddy's reverse_proxy health check
// routes around the instance within health_interval once /healthz stops
// answering, so new traffic stops while in-flight requests drain.

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 8000);

let shuttingDown = false;
function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(
		JSON.stringify({
			level: 'info',
			msg: 'shutdown signal received',
			signal,
			timeoutMs: SHUTDOWN_TIMEOUT_MS,
		})
	);
	setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await import('./build/index.js');
