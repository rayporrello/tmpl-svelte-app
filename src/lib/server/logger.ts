const SENSITIVE_KEYS = new Set([
	'password',
	'token',
	'secret',
	'authorization',
	'cookie',
	'apikey',
	'accesstoken',
	'refreshtoken',
	'clientsecret',
	'privatekey'
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (SENSITIVE_KEYS.has(key.toLowerCase())) {
			result[key] = '[REDACTED]';
		} else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			result[key] = redact(value as Record<string, unknown>);
		} else {
			result[key] = value;
		}
	}
	return result;
}

interface LogContext {
	requestId?: string;
	route?: string;
	[key: string]: unknown;
}

function emit(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
	const { requestId, route, ...meta } = context ?? {};
	const entry: Record<string, unknown> = {
		timestamp: new Date().toISOString(),
		level,
		message,
		...(requestId !== undefined ? { requestId } : {}),
		...(route !== undefined ? { route } : {}),
		...(Object.keys(meta).length > 0 ? { meta: redact(meta) } : {})
	};
	const output = JSON.stringify(entry);
	if (level === 'error') console.error(output);
	else if (level === 'warn') console.warn(output);
	else console.log(output);
}

export const logger = {
	info: (message: string, context?: LogContext) => emit('info', message, context),
	warn: (message: string, context?: LogContext) => emit('warn', message, context),
	error: (message: string, context?: LogContext) => emit('error', message, context)
};
