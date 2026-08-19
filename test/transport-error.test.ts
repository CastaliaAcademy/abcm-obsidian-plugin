import { describe, expect, it } from 'vitest';

import { transportFailureMessage } from '../src/api/http';

describe('Obsidian transport diagnostics', () => {
	it('preserves a bounded actionable cause without credentials', () => {
		expect(transportFailureMessage(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(
			'ABCM service is unreachable: net::ERR_CONNECTION_REFUSED',
		);
		expect(transportFailureMessage(new Error('Authorization: Bearer secret obs_device_abc pair_xyz'))).toBe(
			'ABCM service is unreachable: Authorization: [redacted] [redacted] [redacted]',
		);
		expect(transportFailureMessage(new Error(`line one\n${'x'.repeat(300)}`))).toHaveLength(269);
	});

	it('does not stringify unknown thrown values', () => {
		expect(transportFailureMessage({ credential: 'obs_device_secret' })).toBe('ABCM service is unreachable.');
	});
});
