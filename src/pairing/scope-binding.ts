import type { AbcmSyncSettings } from '../settings/model';

export interface PairingScopeBinding {
	workspaceId: string;
	projectId: string;
	projectPrefix: string | null;
}

export function pairingScopeBinding(
	settings: AbcmSyncSettings,
): PairingScopeBinding | null {
	if (settings.workspaceId === '' || settings.projectId === '') return null;
	return {
		workspaceId: settings.workspaceId,
		projectId: settings.projectId,
		projectPrefix: settings.projectPrefix,
	};
}

export function pairingScopeMatches(
	value: unknown,
	expected: PairingScopeBinding,
): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		candidate.workspaceId === expected.workspaceId &&
		candidate.projectId === expected.projectId &&
		candidate.projectPrefix === expected.projectPrefix
	);
}
