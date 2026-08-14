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
		!(typeof value.objectId === 'string' || value.objectId === null) ||
		typeof value.path !== 'string'
	) {
		throw new Error('Persisted outbox identity is invalid.');
	}
	assertPortablePath(value.path);
	if (value.baseChecksum !== null) assertChecksum(value.baseChecksum);
	return {
		operationId: value.operationId,
		objectId: value.objectId,
		path: value.path,
		baseChecksum: value.baseChecksum,
	};
}

export function hydrateSyncState(value: unknown): PersistedSyncState {
	if (!isRecord(value) || value.schemaVersion !== 1) {
		throw new Error('Unsupported persisted sync state.');
	}
	if (!(typeof value.cursor === 'string' || value.cursor === null)) {
		throw new Error('Persisted cursor is invalid.');
	}
	if (!Array.isArray(value.objects) || !Array.isArray(value.outbox)) {
		throw new Error('Persisted sync collections are invalid.');
	}
	const objects = value.objects.map(parseObject);
	const outbox = value.outbox.map(parseOutbox);
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
	return {
		schemaVersion: 1,
		cursor: value.cursor,
		objects,
		outbox,
	};
}

export function serializeSyncState(state: PersistedSyncState): string {
	return JSON.stringify(hydrateSyncState(state));
}
