import { describe, expect, it } from 'vitest';
import { AbcmTransportError } from '../src/api/http';
import { AbcmSyncHttpError } from '../src/api/sync-client';
import { classifySyncFailure, retryDelayMs } from '../src/sync';

describe('foreground retry policy', () => {
	it('separates revoked authorization from retryable transport and server failures', () => {
		expect(classifySyncFailure(new AbcmSyncHttpError('revoked', 401, 'AUTHENTICATION_REQUIRED'))).toBe('auth-required');
		expect(classifySyncFailure(new AbcmSyncHttpError('denied', 403, 'ACCESS_DENIED'))).toBe('auth-required');
		expect(classifySyncFailure(new AbcmSyncHttpError('busy', 429, 'REST_RATE_LIMIT_EXCEEDED'))).toBe('retryable');
		expect(classifySyncFailure(new AbcmSyncHttpError('down', 503, null))).toBe('retryable');
		expect(classifySyncFailure(new AbcmTransportError('offline'))).toBe('retryable');
		expect(classifySyncFailure(new Error('local invariant'))).toBe('fatal');
	});

	it('uses bounded exponential backoff with deterministic jitter bounds', () => {
		expect(retryDelayMs(0, () => 0)).toBe(750);
		expect(retryDelayMs(0, () => 1)).toBe(1_250);
		expect(retryDelayMs(8, () => 0.5)).toBe(256_000);
		expect(retryDelayMs(99, () => 1)).toBeLessThanOrEqual(375_000);
	});
});
