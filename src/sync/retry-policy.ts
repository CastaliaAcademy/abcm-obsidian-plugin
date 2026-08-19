import { AbcmSyncHttpError } from '../api/sync-client';
import { AbcmTransportError } from '../api/http';

export type SyncFailureKind = 'auth-required' | 'retryable' | 'fatal';

export function classifySyncFailure(error: unknown): SyncFailureKind {
	if (error instanceof AbcmSyncHttpError) {
		if (
			error.status === 401 || error.status === 403 ||
			error.code === 'AUTHENTICATION_REQUIRED' || error.code === 'ACCESS_DENIED'
		) return 'auth-required';
		if (error.status === 429 || error.status >= 500) return 'retryable';
		return 'fatal';
	}
	return error instanceof AbcmTransportError ? 'retryable' : 'fatal';
}

export function retryDelayMs(attempt: number, random = Math.random): number {
	if (!Number.isInteger(attempt) || attempt < 0) throw new Error('Retry attempt must be a non-negative integer.');
	const base = Math.min(300_000, 1_000 * (2 ** Math.min(attempt, 8)));
	const jitter = 0.75 + Math.min(1, Math.max(0, random())) * 0.5;
	return Math.round(base * jitter);
}
