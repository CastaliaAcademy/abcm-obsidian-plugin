import type { HttpTransport } from './http';
import type { SupportedPlatform } from '../settings/model';

export interface PairingDevice {
	id: string;
	name: string;
	platform: SupportedPlatform;
}

export interface DeviceGrant {
	deviceId: string;
	credential: string;
	workspaceId: string;
	projectId: string;
	projectPrefix: string | null;
	capabilities: Array<'read' | 'write'>;
	expiresAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCapabilities(value: unknown): Array<'read' | 'write'> {
	if (!Array.isArray(value)) {
		throw new Error('ABCM pairing response is invalid.');
	}
	const result: Array<'read' | 'write'> = [];
	for (const candidate of value) {
		const item: unknown = candidate;
		if (item !== 'read' && item !== 'write') {
			throw new Error('ABCM pairing response is invalid.');
		}
		result.push(item);
	}
	return result;
}

function parseGrant(value: unknown): DeviceGrant {
	if (!isRecord(value)) throw new Error('ABCM pairing response is invalid.');
	const capabilities = parseCapabilities(value.capabilities);
	if (
		typeof value.deviceId !== 'string' ||
		typeof value.credential !== 'string' ||
		typeof value.workspaceId !== 'string' ||
		typeof value.projectId !== 'string' ||
		!(value.projectPrefix === null || typeof value.projectPrefix === 'string') ||
		!(value.expiresAt === null || typeof value.expiresAt === 'string')
	) {
		throw new Error('ABCM pairing response is invalid.');
	}
	return {
		deviceId: value.deviceId,
		credential: value.credential,
		workspaceId: value.workspaceId,
		projectId: value.projectId,
		projectPrefix: value.projectPrefix,
		capabilities,
		expiresAt: value.expiresAt,
	};
}

export async function redeemPairing(
	transport: HttpTransport,
	endpoint: string,
	pairingCode: string,
	device: PairingDevice,
): Promise<DeviceGrant> {
	if (!/^pair_[A-Za-z0-9_-]{8,123}$/.test(pairingCode)) {
		throw new Error('Pairing code format is invalid.');
	}
	const response = await transport.request({
		url: `${endpoint}/v1/obsidian/pairings/redeem`,
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ pairingCode, device }),
	});
	if (response.status !== 200) {
		throw new Error(`ABCM pairing failed with HTTP ${response.status}.`);
	}
	return parseGrant(response.json);
}
