import type { ConflictResolution, SyncApi } from '../api/sync-client';
import type { LocalReplica, SyncCycleOptions } from './sync-cycle';
import type { PersistedConflictState, PersistedSyncState, SyncChecksum } from './types';

function sideChecksum(side: PersistedConflictState['local']): SyncChecksum | null {
	return side.state === 'present' ? side.checksum : null;
}

async function hasPath(local: LocalReplica, path: string): Promise<boolean> {
	return (await local.inventory()).some((entry) => entry.path === path);
}

async function deleteIfPresent(local: LocalReplica, path: string | null): Promise<void> {
	if (path !== null && await hasPath(local, path)) await local.delete(path);
}

async function writeVerified(
	client: SyncApi,
	local: LocalReplica,
	path: string,
	expected: SyncChecksum,
	checksum: SyncCycleOptions['checksum'],
): Promise<void> {
	const content = await client.readContent(path);
	if (await checksum(content) !== expected) throw new Error(`Resolved server content changed at '${path}'.`);
	await local.write(path, content);
	if (await checksum(await local.read(path)) !== expected) throw new Error(`Resolved vault write verification failed at '${path}'.`);
}

export interface ResolveConflictOptions {
	operationId(): string;
	checksum: SyncCycleOptions['checksum'];
	persistState(state: PersistedSyncState): Promise<void> | void;
}

export async function resolvePersistedConflict(
	client: SyncApi,
	local: LocalReplica,
	state: PersistedSyncState,
	conflictId: string,
	resolution: ConflictResolution,
	keepBothPath: string | undefined,
	options: ResolveConflictOptions,
): Promise<PersistedSyncState> {
	if (client.resolveConflict === undefined) throw new Error('Conflict resolution is unavailable.');
	const conflict = state.conflicts.find((candidate) => candidate.conflictId === conflictId);
	if (conflict === undefined) throw new Error(`Conflict '${conflictId}' is not pending.`);
	if (resolution === 'keep-both' && (keepBothPath === undefined || keepBothPath === '')) {
		throw new Error('Keep both requires a destination path.');
	}
	const localContent = conflict.local.state === 'present' && conflict.localPath !== null
		? await local.read(conflict.localPath)
		: null;
	const localChecksum = sideChecksum(conflict.local);
	if (localContent !== null && (localChecksum === null || await options.checksum(localContent) !== localChecksum)) {
		throw new Error(`Local conflict bytes changed at '${conflict.localPath ?? conflict.path}'.`);
	}
	const receipt = await client.resolveConflict(conflictId, {
		operationId: options.operationId(),
		resolution,
		localChecksum: sideChecksum(conflict.local),
		serverChecksum: sideChecksum(conflict.server),
		...(resolution === 'keep-both' ? { keepBothPath } : {}),
	});

	if (resolution === 'keep-server') {
		if (conflict.server.state === 'present' && conflict.serverPath !== null) {
			await writeVerified(client, local, conflict.serverPath, conflict.server.checksum, options.checksum);
			if (conflict.localPath !== conflict.serverPath) await deleteIfPresent(local, conflict.localPath);
		} else await deleteIfPresent(local, conflict.localPath);
	} else if (resolution === 'keep-both') {
		const target = keepBothPath!;
		if (localContent !== null && conflict.local.state === 'present') {
			if (conflict.localPath !== target) await local.write(target, localContent);
			if (conflict.server.state === 'present' && conflict.serverPath !== null) {
				await writeVerified(client, local, conflict.serverPath, conflict.server.checksum, options.checksum);
			} else if (conflict.localPath !== target) await deleteIfPresent(local, conflict.localPath);
			if (conflict.localPath !== target && conflict.localPath !== conflict.serverPath) await deleteIfPresent(local, conflict.localPath);
		} else if (conflict.server.state === 'present') {
			await writeVerified(client, local, target, conflict.server.checksum, options.checksum);
			await deleteIfPresent(local, conflict.serverPath);
		}
	}

	state.conflicts = state.conflicts.filter((candidate) => candidate.conflictId !== conflictId);
	state.pendingMoves = state.pendingMoves.filter((move) => move.objectId !== conflict.objectId);
	state.objects = state.objects.filter((object) => object.objectId !== conflict.objectId);
	if (resolution === 'keep-server' && conflict.server.state === 'present' && conflict.serverPath !== null) {
		state.objects.push({ objectId: conflict.objectId, path: conflict.serverPath, checksum: conflict.server.checksum });
	} else if (resolution === 'keep-local' && conflict.local.state === 'present' && conflict.localPath !== null) {
		state.objects.push({ objectId: receipt.objectId, path: conflict.localPath, checksum: conflict.local.checksum });
	} else if (resolution === 'keep-both' && conflict.local.state === 'present') {
		if (conflict.server.state === 'present' && conflict.serverPath !== null) {
			state.objects.push({ objectId: conflict.objectId, path: conflict.serverPath, checksum: conflict.server.checksum });
		}
		state.objects.push({ objectId: receipt.objectId, path: keepBothPath!, checksum: conflict.local.checksum });
	}
	state.cursor = receipt.cursor;
	await options.persistState(state);
	return state;
}
