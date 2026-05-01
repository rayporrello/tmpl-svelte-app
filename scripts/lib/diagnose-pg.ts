import type { ErrorCode } from './errors';

export type PostgresDiagnosis = {
	code: ErrorCode;
	hint: string;
};

function readErrorCode(error: unknown): string | undefined {
	if (error && typeof error === 'object') {
		const candidate = error as { code?: unknown; errno?: unknown };
		if (typeof candidate.code === 'string') return candidate.code;
		if (typeof candidate.errno === 'string') return candidate.errno;
	}
	return undefined;
}

function readErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function diagnosePostgresError(error: unknown): PostgresDiagnosis {
	const code = readErrorCode(error);
	const message = readErrorMessage(error);

	if (code === '28P01' || /28P01|password authentication failed/iu.test(message)) {
		return {
			code: 'BOOT-DB-002',
			hint: 'NEXT: Verify the password in DATABASE_URL matches the database user.',
		};
	}

	if (code === '3D000' || /3D000|database .* does not exist/iu.test(message)) {
		return {
			code: 'BOOT-DB-003',
			hint: 'NEXT: Create the database, or re-run ./bootstrap to provision a local one.',
		};
	}

	if (code === '42501' || /42501|permission denied|must be owner/iu.test(message)) {
		return {
			code: 'BOOT-DB-004',
			hint: 'NEXT: Grant the user privileges on schema public: GRANT ALL ON SCHEMA public TO <user>;',
		};
	}

	if (code === 'ECONNREFUSED' || /ECONNREFUSED|connection refused/iu.test(message)) {
		return {
			code: 'BOOT-PG-001',
			hint: 'NEXT: Start Postgres, or re-run ./bootstrap to provision a local container.',
		};
	}

	return {
		code: 'BOOT-DB-001',
		hint: 'NEXT: Check DATABASE_URL in .env. Format: postgres://user:pw@host:port/db',
	};
}
