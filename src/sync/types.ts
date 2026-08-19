export type SyncChecksum = `sha256:${string}`;

export interface ReplicaEntry {
	objectId: string | null;
	path: string;
	checksum: SyncChecksum;
	size: number;
	contentType?: string;
}

export interface BaseEntry {
	objectId: string;
	path: string;
	checksum: SyncChecksum;
}

export type ReplicaMutationKind =
	| 'create'
	| 'update'
	| 'delete'
	| 'move'
	| 'update-and-move';

export type SyncConflictKind =
	| 'concurrent-update'
	| 'delete-update'
	| 'move-move';

export type SyncDecision =
	| {
			action: 'noop';
			objectId: string | null;
			path: string;
	  }
	| {
			action: 'push' | 'pull';
			kind: ReplicaMutationKind;
			objectId: string | null;
			path: string;
			previousPath?: string;
	  }
	| {
			action: 'conflict';
			kind: SyncConflictKind;
			objectId: string | null;
			path: string;
	  };

export interface ChangeIdentity {
	originDeviceId: string | null;
	operationId: string;
}

export interface PersistedObjectState {
	objectId: string;
	path: string;
	checksum: SyncChecksum;
}

export interface PersistedPendingMove {
	objectId: string;
	previousPath: string;
	path: string;
}

export type ConflictSide =
	| {
			state: 'present';
			checksum: SyncChecksum;
			size: number;
			contentType: string;
	  }
	| {
			state: 'deleted';
			baseChecksum: SyncChecksum;
	  };

export interface PersistedConflictState {
	conflictId: string;
	objectId: string;
	kind: SyncConflictKind | 'portable-path';
	path: string;
	localPath: string | null;
	serverPath: string | null;
	local: ConflictSide;
	server: ConflictSide;
	baseChecksum: SyncChecksum | null;
	artifactPath: string;
}

export interface PersistedOutboxEntry {
	operationId: string;
	objectId: string;
	path: string;
	kind: 'create' | 'update' | 'delete' | 'move';
	checksum: SyncChecksum | null;
	baseChecksum: SyncChecksum | null;
	size: number | null;
	contentType: string | null;
	previousPath?: string | null;
	previewId: string;
	serverRevision: string;
	previewCursor: string;
}

export interface PersistedSyncState {
	schemaVersion: 5;
	cursor: string | null;
	objects: PersistedObjectState[];
	outbox: PersistedOutboxEntry[];
	pendingMoves: PersistedPendingMove[];
	conflicts: PersistedConflictState[];
	recentOperationIds: string[];
}
