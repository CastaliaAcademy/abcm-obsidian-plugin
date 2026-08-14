import { assertPortablePath } from '../sync';

export type SupportedPlatform = 'windows' | 'linux' | 'ipados';

export interface AbcmSyncSettings {
	endpoint: string;
	workspaceId: string;
	projectId: string;
	projectPrefix: string | null;
	vaultFolder: string;
	include: string[];
	exclude: string[];
	intervalSeconds: number;
	deviceName: string;
	deviceId: string | null;
	credentialSecretId: string | null;
}

export const DEVICE_CREDENTIAL_SECRET_ID = 'abcm-sync-device-credential';

export const DEFAULT_SETTINGS: AbcmSyncSettings = {
	endpoint: '',
	workspaceId: '',
	projectId: '',
	projectPrefix: null,
	vaultFolder: '',
	include: [],
	exclude: [],
	intervalSeconds: 60,
	deviceName: 'Obsidian',
	deviceId: null,
	credentialSecretId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown, fallback: string | null): string | null {
	return value === null || typeof value === 'string' ? value : fallback;
}

function patterns(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
}

export function normalizeSettings(value: unknown): AbcmSyncSettings {
	if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
	return {
		endpoint: stringValue(value.endpoint, ''),
		workspaceId: stringValue(value.workspaceId, ''),
		projectId: stringValue(value.projectId, ''),
		projectPrefix: nullableString(value.projectPrefix, null),
		vaultFolder: stringValue(value.vaultFolder, ''),
		include: patterns(value.include),
		exclude: patterns(value.exclude),
		intervalSeconds:
			typeof value.intervalSeconds === 'number'
				? value.intervalSeconds
				: DEFAULT_SETTINGS.intervalSeconds,
		deviceName: stringValue(value.deviceName, DEFAULT_SETTINGS.deviceName),
		deviceId: nullableString(value.deviceId, null),
		credentialSecretId: nullableString(value.credentialSecretId, null),
	};
}

export function normalizeEndpoint(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('ABCM endpoint must be an absolute URL.');
	}
	const localHttp =
		url.protocol === 'http:' &&
		['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !localHttp) {
		throw new Error('ABCM endpoint must use HTTPS, except for localhost.');
	}
	if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
		throw new Error('ABCM endpoint must not contain credentials, query, or fragment.');
	}
	return url.toString().replace(/\/$/, '');
}

export function parsePatternList(value: string): string[] {
	const result = [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))];
	if (result.length > 64 || result.some((item) => item.length > 256)) {
		throw new Error('Include/exclude lists exceed ABCM protocol limits.');
	}
	return result;
}

export function validateSettings(settings: AbcmSyncSettings): AbcmSyncSettings {
	const endpoint = normalizeEndpoint(settings.endpoint);
	if (
		!Number.isInteger(settings.intervalSeconds) ||
		settings.intervalSeconds < 15 ||
		settings.intervalSeconds > 3_600
	) {
		throw new Error('Sync interval must be between 15 and 3600 seconds.');
	}
	if (settings.deviceName.trim().length === 0 || settings.deviceName.length > 160) {
		throw new Error('Device name must contain 1 to 160 characters.');
	}
	if (settings.vaultFolder !== '') assertPortablePath(settings.vaultFolder);
	for (const pattern of [...settings.include, ...settings.exclude]) {
		if (pattern.length === 0 || pattern.length > 256) {
			throw new Error('Include/exclude pattern is invalid.');
		}
	}
	return { ...settings, endpoint, deviceName: settings.deviceName.trim() };
}
