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

export interface PersistedOutboxEntry {
	operationId: string;
	objectId: string | null;
	path: string;
	baseChecksum: SyncChecksum | null;
}

export interface PersistedSyncState {
	schemaVersion: 1;
	cursor: string | null;
	objects: PersistedObjectState[];
	outbox: PersistedOutboxEntry[];
}
