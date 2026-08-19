import { describe, expect, it } from 'vitest';
import type { HttpTransport } from '../src/api/http';
import { pairDevice } from '../src/pairing/pairing-service';
import {
	DEFAULT_SETTINGS,
	DEVICE_CREDENTIAL_SECRET_ID,
} from '../src/settings/model';

describe('scoped Obsidian device pairing', () => {
	it('sends only code and device, then stores the credential only in SecretStorage', async () => {
		let capturedBodyText = '{}';
		const transport: HttpTransport = {
			request(request) {
				capturedBodyText = request.body ?? '';
				return Promise.resolve({
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					json: {
						deviceId: 'device_00000001',
						credential: 'obs_device_secret_that_never_enters_settings',
						workspaceId: 'castalia-public',
						projectId: 'abcm',
						projectPrefix: 'abcm',
						capabilities: ['read', 'write'],
						expiresAt: null,
					},
				});
			},
		};
		const secrets = new Map<string, string>();
		let persisted: unknown = null;
		const next = await pairDevice(
			transport,
			{ setSecret: (id, secret) => secrets.set(id, secret) },
			async (settings) => {
				persisted = settings;
			},
			{ ...DEFAULT_SETTINGS, endpoint: 'https://abcm.example.test' },
			{
				pairingCode: 'pair_00000001',
				deviceId: 'device_00000001',
				platform: 'ipados',
			},
		);

		const capturedBody: unknown = JSON.parse(capturedBodyText);
		expect(capturedBody).toEqual({
			pairingCode: 'pair_00000001',
			device: {
				id: 'device_00000001',
				name: 'Obsidian',
				platform: 'ipados',
			},
		});
		expect(capturedBodyText).not.toContain('workspaceId');
		expect(secrets.get(DEVICE_CREDENTIAL_SECRET_ID)).toContain('obs_device_');
		expect(next.workspaceId).toBe('castalia-public');
		expect(JSON.stringify(persisted)).not.toContain('obs_device_secret');
	});
});
