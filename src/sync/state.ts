import { assertPortablePath, portablePathKey } from './portable-path';
import type {
	PersistedObjectState,
	PersistedOutboxEntry,
	PersistedSyncState,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertChecksum(value: unknown): asserts value is `sha256:${string}` {
	if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error('Persisted checksum is invalid.');
	}
}

function parseObject(value: unknown): PersistedObjectState {
	if (!isRecord(value)) throw new Error('Persisted object is invalid.');
	if (typeof value.objectId !== 'string' || typeof value.path !== 'string') {
		throw new Error('Persisted object identity is invalid.');
	}
	assertPortablePath(value.path);
	assertChecksum(value.checksum);
	return {
		objectId: value.objectId,
		path: value.path,
		checksum: value.checksum,
	};
}

function parseOutbox(value: unknown): PersistedOutboxEntry {
	if (!isRecord(value)) throw new Error('Persisted outbox entry is invalid.');
	if (
		typeof value.operationId !== 'string' ||
		typeof value.objectId !== 'string' ||
		typeof value.path !== 'string' ||
		(value.kind !== 'create' && value.kind !== 'update') ||
		typeof value.size !== 'number' ||
		!Number.isSafeInteger(value.size) ||
		value.size < 0 ||
		typeof value.contentType !== 'string' ||
		typeof value.previewId !== 'string' ||
		typeof value.serverRevision !== 'string' ||
		typeof value.previewCursor !== 'string'
	) {
		throw new Error('Persisted outbox identity is invalid.');
	}
	assertPortablePath(value.path);
	assertChecksum(value.checksum);
	if (value.baseChecksum !== null) assertChecksum(value.baseChecksum);
	if (value.kind === 'create' && value.baseChecksum !== null) {
		throw new Error('Persisted create operation has a base checksum.');
	}
	if (value.kind === 'update' && value.baseChecksum === null) {
		throw new Error('Persisted update operation has no base checksum.');
	}
	return {
		operationId: value.operationId,
		objectId: value.objectId,
		path: value.path,
		kind: value.kind,
		checksum: value.checksum,
		baseChecksum: value.baseChecksum,
		size: value.size,
		contentType: value.contentType,
		previewId: value.previewId,
		serverRevision: value.serverRevision,
		previewCursor: value.previewCursor,
	};
}

function assertUniqueObjects(objects: PersistedObjectState[]): void {
	const objectIds = new Set<string>();
	const paths = new Set<string>();
	for (const object of objects) {
		if (objectIds.has(object.objectId)) {
			throw new Error('Persisted state contains duplicate object identity.');
		}
		const key = portablePathKey(object.path);
		if (paths.has(key)) {
			throw new Error('Persisted state contains a portable path collision.');
		}
		objectIds.add(object.objectId);
		paths.add(key);
	}
}

export function createInitialSyncState(): PersistedSyncState {
	return {
		schemaVersion: 2,
		cursor: null,
		objects: [],
		outbox: [],
		recentOperationIds: [],
	};
}

export function hydrateSyncState(value: unknown): PersistedSyncState {
	if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
		throw new Error('Unsupported persisted sync state.');
	}
	if (!(typeof value.cursor === 'string' || value.cursor === null)) {
		throw new Error('Persisted cursor is invalid.');
	}
	if (!Array.isArray(value.objects) || !Array.isArray(value.outbox)) {
		throw new Error('Persisted sync collections are invalid.');
	}
	const objects = value.objects.map(parseObject);
	assertUniqueObjects(objects);

	if (value.schemaVersion === 1) {
		if (value.outbox.length > 0) {
			throw new Error('Legacy pending outbox cannot be resumed safely.');
		}
		return { ...createInitialSyncState(), cursor: value.cursor, objects };
	}

	if (!Array.isArray(value.recentOperationIds)) {
		throw new Error('Persisted recent operation identities are invalid.');
	}
	const recentOperationIds = value.recentOperationIds.map((operationId) => {
		if (typeof operationId !== 'string') {
			throw new Error('Persisted recent operation identity is invalid.');
		}
		return operationId;
	});
	if (new Set(recentOperationIds).size !== recentOperationIds.length) {
		throw new Error('Persisted recent operation identities contain duplicates.');
	}
	return {
		schemaVersion: 2,
		cursor: value.cursor,
		objects,
		outbox: value.outbox.map(parseOutbox),
		recentOperationIds,
	};
}

export function serializeSyncState(state: PersistedSyncState): string {
	return JSON.stringify(hydrateSyncState(state));
}
