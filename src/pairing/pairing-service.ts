import { redeemPairing } from '../api/pairing-client';
import type { HttpTransport } from '../api/http';
import {
	DEVICE_CREDENTIAL_SECRET_ID,
	validateSettings,
	type AbcmSyncSettings,
	type SupportedPlatform,
} from '../settings/model';

export interface SecretWriter {
	setSecret(id: string, secret: string): void;
}

export interface PairingInput {
	pairingCode: string;
	deviceId: string;
	platform: SupportedPlatform;
}

export async function pairDevice(
	transport: HttpTransport,
	secrets: SecretWriter,
	persist: (settings: AbcmSyncSettings) => Promise<void>,
	settings: AbcmSyncSettings,
	input: PairingInput,
): Promise<AbcmSyncSettings> {
	const validated = validateSettings(settings);
	const grant = await redeemPairing(
		transport,
		validated.endpoint,
		input.pairingCode,
		{
			id: input.deviceId,
			name: validated.deviceName,
			platform: input.platform,
		},
	);
	secrets.setSecret(DEVICE_CREDENTIAL_SECRET_ID, grant.credential);
	const next: AbcmSyncSettings = {
		...validated,
		workspaceId: grant.workspaceId,
		projectId: grant.projectId,
		projectPrefix: grant.projectPrefix,
		deviceId: grant.deviceId,
		credentialSecretId: DEVICE_CREDENTIAL_SECRET_ID,
	};
	await persist(next);
	return next;
}
