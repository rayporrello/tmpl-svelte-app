// Production entrypoint for the Bun container.
//
// svelte-adapter-bun 0.5.2's build/index.js calls Bun.serve() directly and does
// not currently export the server handle. SIGTERM (sent by Quadlet/Podman on
// rolling restart) would otherwise terminate the process immediately,
// truncating in-flight HTTP responses and dropping postgres connections
// mid-query.
//
// Drain contract:
//   SIGTERM/SIGINT -> hooks.server marks lifecycle draining
//   -> /healthz returns 503 -> Caddy reroutes within 2 x health_interval
//   -> listener stop is attempted if a future adapter exposes the server handle
//   -> in-flight requests drain -> process exits after SHUTDOWN_TIMEOUT_MS.

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 25000);
const LISTENER_STOP_GRACE_MS = Number(process.env.LISTENER_STOP_GRACE_MS ?? 20000);

let serverHandle;
let shuttingDown = false;
let listenerStopLogged = false;

function stopListenerIfExposed() {
	if (serverHandle && typeof serverHandle.stop === 'function') {
		serverHandle.stop(false);
		return;
	}
	if (listenerStopLogged) return;
	listenerStopLogged = true;
	console.log(
		JSON.stringify({
			level: 'info',
			msg: 'Bun server handle was not exposed by svelte-adapter-bun 0.5.2; skipping listener stop',
			todo: 'Remove this fallback if the adapter starts exporting the Bun.serve() handle.',
		})
	);
}

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(
		JSON.stringify({
			level: 'info',
			msg: 'shutdown signal received',
			signal,
			timeoutMs: SHUTDOWN_TIMEOUT_MS,
			listenerStopGraceMs: LISTENER_STOP_GRACE_MS,
		})
	);
	setTimeout(stopListenerIfExposed, LISTENER_STOP_GRACE_MS);
	setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const serverModule = await import('./build/index.js');
serverHandle = serverModule.server;
