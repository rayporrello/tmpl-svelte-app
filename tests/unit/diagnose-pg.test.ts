import { describe, expect, it } from 'vitest';

import { diagnosePostgresError } from '../../scripts/lib/diagnose-pg';

describe('diagnosePostgresError()', () => {
	it('maps SQLSTATE auth failure to BOOT-DB-002', () => {
		expect(diagnosePostgresError({ code: '28P01', message: 'bad password' })).toEqual({
			code: 'BOOT-DB-002',
			hint: 'NEXT: Verify the password in DATABASE_URL matches the database user.',
		});
	});

	it('maps missing database and permission errors', () => {
		expect(diagnosePostgresError({ code: '3D000' }).code).toBe('BOOT-DB-003');
		expect(diagnosePostgresError({ code: '42501' }).code).toBe('BOOT-DB-004');
	});

	it('maps connection refused to BOOT-PG-001', () => {
		expect(diagnosePostgresError(new Error('connect ECONNREFUSED 127.0.0.1:1'))).toEqual({
			code: 'BOOT-PG-001',
			hint: 'NEXT: Start Postgres, or re-run ./bootstrap to provision a local container.',
		});
	});

	it('falls back to DATABASE_URL parse guidance', () => {
		expect(diagnosePostgresError(new Error('invalid url')).code).toBe('BOOT-DB-001');
	});
});
