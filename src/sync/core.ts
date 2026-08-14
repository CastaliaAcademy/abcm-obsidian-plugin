import { assertPortablePath } from './portable-path';
import type {
	BaseEntry,
	ChangeIdentity,
	ReplicaEntry,
	ReplicaMutationKind,
	SyncConflictKind,
	SyncDecision,
} from './types';

interface PlanObjectInput {
	base: BaseEntry | null;
	local: ReplicaEntry | null;
	server: ReplicaEntry | null;
}

type ChangeKind = Exclude<ReplicaMutationKind, 'create'> | 'none';

function assertEntry(entry: ReplicaEntry | BaseEntry | null): void {
	if (entry === null) return;
	assertPortablePath(entry.path);
	if (!/^sha256:[0-9a-f]{64}$/.test(entry.checksum)) {
		throw new Error('Replica checksum must be a lowercase SHA-256 digest.');
	}
}

function changeKind(base: BaseEntry, entry: ReplicaEntry | null): ChangeKind {
	if (entry === null) return 'delete';
	const moved = entry.path !== base.path;
	const updated = entry.checksum !== base.checksum;
	if (moved && updated) return 'update-and-move';
	if (moved) return 'move';
	if (updated) return 'update';
	return 'none';
}

function sameReplica(
	left: ReplicaEntry | null,
	right: ReplicaEntry | null,
): boolean {
	return (
		left === right ||
		(left !== null &&
			right !== null &&
			left.path === right.path &&
			left.checksum === right.checksum)
	);
}

function conflictKind(
	base: BaseEntry,
	local: ReplicaEntry | null,
	server: ReplicaEntry | null,
): SyncConflictKind {
	if (local === null || server === null) return 'delete-update';
	if (
		local.path !== base.path &&
		server.path !== base.path &&
		local.path !== server.path
	) {
		return 'move-move';
	}
	return 'concurrent-update';
}

function mutationDecision(
	action: 'push' | 'pull',
	kind: Exclude<ChangeKind, 'none'>,
	base: BaseEntry,
	entry: ReplicaEntry | null,
): SyncDecision {
	return {
		action,
		kind,
		objectId: base.objectId,
		path: entry?.path ?? base.path,
		...(kind === 'move' || kind === 'update-and-move'
			? { previousPath: base.path }
			: {}),
	};
}

export function planReplicaObject(input: PlanObjectInput): SyncDecision {
	const { base, local, server } = input;
	assertEntry(base);
	assertEntry(local);
	assertEntry(server);

	if (base === null) {
		if (local === null && server === null) {
			throw new Error('At least one replica must exist without a base object.');
		}
		if (local !== null && server !== null) {
			if (sameReplica(local, server)) {
				return {
					action: 'noop',
					objectId: server.objectId ?? local.objectId,
					path: server.path,
				};
			}
			return {
				action: 'conflict',
				kind: 'concurrent-update',
				objectId: server.objectId ?? local.objectId,
				path: server.path,
			};
		}
		const entry = local ?? server;
		if (entry === null) throw new Error('Replica entry is required.');
		return {
			action: local === null ? 'pull' : 'push',
			kind: 'create',
			objectId: entry.objectId,
			path: entry.path,
		};
	}

	for (const entry of [local, server]) {
		if (
			entry !== null &&
			entry.objectId !== null &&
			entry.objectId !== base.objectId
		) {
			throw new Error('Replica object identity differs from its base object.');
		}
	}
	const localChange = changeKind(base, local);
	const serverChange = changeKind(base, server);
	if (localChange === 'none' && serverChange === 'none') {
		return { action: 'noop', objectId: base.objectId, path: base.path };
	}
	if (localChange === 'none' && serverChange !== 'none') {
		return mutationDecision('pull', serverChange, base, server);
	}
	if (serverChange === 'none' && localChange !== 'none') {
		return mutationDecision('push', localChange, base, local);
	}
	if (sameReplica(local, server)) {
		return {
			action: 'noop',
			objectId: base.objectId,
			path: local?.path ?? base.path,
		};
	}
	return {
		action: 'conflict',
		kind: conflictKind(base, local, server),
		objectId: base.objectId,
		path: server?.path ?? local?.path ?? base.path,
	};
}

export function shouldSuppressEcho(
	change: ChangeIdentity,
	deviceId: string,
	pendingOperationIds: ReadonlySet<string>,
): boolean {
	return (
		change.originDeviceId === deviceId &&
		pendingOperationIds.has(change.operationId)
	);
}
