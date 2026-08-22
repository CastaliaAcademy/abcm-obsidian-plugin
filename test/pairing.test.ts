import { describe, expect, it } from 'vitest';
import type { HttpTransport } from '../src/api/http';
import {
	clearPairingAuthorization,
	pairDevice,
} from '../src/pairing/pairing-service';
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
			{ resetSyncState: () => undefined },
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

	it('retains the assigned scope when clearing authorization', () => {
		const cleared = clearPairingAuthorization({
			...DEFAULT_SETTINGS,
			workspaceId: 'abcm-acceptance-windows',
			projectId: 'fixture',
			projectPrefix: 'fixture',
			credentialSecretId: DEVICE_CREDENTIAL_SECRET_ID,
			paused: false,
		});

		expect(cleared).toEqual(
			expect.objectContaining({
				workspaceId: 'abcm-acceptance-windows',
				projectId: 'fixture',
				projectPrefix: 'fixture',
				credentialSecretId: null,
				paused: true,
			}),
		);
	});

	it('resets durable sync state before storing a credential for another scope', async () => {
		const events: string[] = [];
		const transport: HttpTransport = {
			request() {
				return Promise.resolve({
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					json: {
						deviceId: 'device_00000001',
						credential: 'obs_device_new_scope_secret',
						workspaceId: 'castalia-public',
						projectId: 'abcm',
						projectPrefix: 'abcm',
						capabilities: ['read', 'write'],
						expiresAt: null,
					},
				});
			},
		};

		await pairDevice(
			transport,
			{ setSecret: () => events.push('credential') },
			async () => {
				events.push('settings');
			},
			{
				...DEFAULT_SETTINGS,
				endpoint: 'https://abcm.example.test',
				workspaceId: 'abcm-acceptance-windows',
				projectId: 'fixture',
				projectPrefix: 'fixture',
			},
			{
				pairingCode: 'pair_00000002',
				deviceId: 'device_00000001',
				platform: 'windows',
			},
			{ resetSyncState: () => events.push('state') },
		);

		expect(events).toEqual(['state', 'credential', 'settings']);
	});

	it('preserves durable sync state when reauthorizing the same scope', async () => {
		const transport: HttpTransport = {
			request() {
				return Promise.resolve({
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					json: {
						deviceId: 'device_00000001',
						credential: 'obs_device_reauthorized_secret',
						workspaceId: 'castalia-public',
						projectId: 'abcm',
						projectPrefix: 'abcm',
						capabilities: ['read', 'write'],
						expiresAt: null,
					},
				});
			},
		};
		let resets = 0;

		await pairDevice(
			transport,
			{ setSecret: () => undefined },
			async () => undefined,
			{
				...DEFAULT_SETTINGS,
				endpoint: 'https://abcm.example.test',
				workspaceId: 'castalia-public',
				projectId: 'abcm',
				projectPrefix: 'abcm',
			},
			{
				pairingCode: 'pair_00000003',
				deviceId: 'device_00000001',
				platform: 'windows',
			},
			{
				resetSyncState: () => {
					resets += 1;
				},
			},
		);

		expect(resets).toBe(0);
	});
});
