import { assertPortablePath, portablePathKey } from './portable-path';
import type {
	ConflictSide,
	PersistedConflictState,
	PersistedObjectState,
	PersistedOutboxEntry,
	PersistedPendingMove,
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

function parsePendingMove(value: unknown): PersistedPendingMove {
	if (!isRecord(value) || typeof value.objectId !== 'string' || typeof value.previousPath !== 'string' || typeof value.path !== 'string') {
		throw new Error('Persisted pending move is invalid.');
	}
	assertPortablePath(value.previousPath);
	assertPortablePath(value.path);
	if (portablePathKey(value.previousPath) === portablePathKey(value.path)) {
		throw new Error('Persisted pending move has identical paths.');
	}
	return {
		objectId: value.objectId,
		previousPath: value.previousPath,
		path: value.path,
	};
}

function parseConflictSide(value: unknown): ConflictSide {
	if (!isRecord(value) || (value.state !== 'present' && value.state !== 'deleted')) {
		throw new Error('Persisted conflict side is invalid.');
	}
	if (value.state === 'deleted') {
		assertChecksum(value.baseChecksum);
		return { state: 'deleted', baseChecksum: value.baseChecksum };
	}
	assertChecksum(value.checksum);
	if (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0 || typeof value.contentType !== 'string') {
		throw new Error('Persisted conflict content metadata is invalid.');
	}
	return { state: 'present', checksum: value.checksum, size: value.size, contentType: value.contentType };
}

function parseConflict(value: unknown): PersistedConflictState {
	if (!isRecord(value)) throw new Error('Persisted conflict is invalid.');
	const kinds = new Set(['concurrent-update', 'delete-update', 'move-move', 'portable-path']);
	if (
		typeof value.conflictId !== 'string' || typeof value.objectId !== 'string' ||
		typeof value.kind !== 'string' || !kinds.has(value.kind) || typeof value.path !== 'string' ||
		!(typeof value.localPath === 'string' || value.localPath === null) ||
		!(typeof value.serverPath === 'string' || value.serverPath === null) ||
		typeof value.artifactPath !== 'string'
	) throw new Error('Persisted conflict identity is invalid.');
	assertPortablePath(value.path);
	if (typeof value.localPath === 'string') assertPortablePath(value.localPath);
	if (typeof value.serverPath === 'string') assertPortablePath(value.serverPath);
	if (!value.artifactPath.startsWith('_ABCM Conflicts/' + value.conflictId + '/')) {
		throw new Error('Persisted conflict artifact path is invalid.');
	}
	if (value.baseChecksum !== null) assertChecksum(value.baseChecksum);
	return {
		conflictId: value.conflictId,
		objectId: value.objectId,
		kind: value.kind as PersistedConflictState['kind'],
		path: value.path,
		localPath: value.localPath,
		serverPath: value.serverPath,
		local: parseConflictSide(value.local),
		server: parseConflictSide(value.server),
		baseChecksum: value.baseChecksum,
		artifactPath: value.artifactPath,
	};
}

function parseOutbox(value: unknown): PersistedOutboxEntry {
	if (!isRecord(value)) throw new Error('Persisted outbox entry is invalid.');
	const kinds = new Set(['create', 'update', 'delete', 'move']);
	if (
		typeof value.operationId !== 'string' ||
		typeof value.objectId !== 'string' ||
		typeof value.path !== 'string' ||
		typeof value.kind !== 'string' ||
		!kinds.has(value.kind) ||
		typeof value.previewId !== 'string' ||
		typeof value.serverRevision !== 'string' ||
		typeof value.previewCursor !== 'string'
	) {
		throw new Error('Persisted outbox identity is invalid.');
	}
	const kind = value.kind as PersistedOutboxEntry['kind'];
	const size = value.size;
	if (
		size !== null &&
		(typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
	) {
		throw new Error('Persisted operation size is invalid.');
	}
	const contentType = value.contentType;
	if (contentType !== null && typeof contentType !== 'string') {
		throw new Error('Persisted operation content type is invalid.');
	}
	assertPortablePath(value.path);
	if (value.checksum !== null) assertChecksum(value.checksum);
	if (value.baseChecksum !== null) assertChecksum(value.baseChecksum);
	const contentOperation = value.kind === 'create' || value.kind === 'update';
	if (contentOperation) {
		assertChecksum(value.checksum);
		if (
			typeof value.size !== 'number' || !Number.isSafeInteger(value.size) ||
			value.size < 0 || typeof value.contentType !== 'string'
		) throw new Error('Persisted content operation is invalid.');
	}
	if (value.kind === 'create' && value.baseChecksum !== null) {
		throw new Error('Persisted create operation has a base checksum.');
	}
	if (value.kind !== 'create' && value.baseChecksum === null) {
		throw new Error('Persisted mutation has no base checksum.');
	}
	if (value.kind === 'delete' && (value.checksum !== null || value.size !== null || value.contentType !== null)) {
		throw new Error('Persisted delete operation contains content metadata.');
	}
	if (value.kind === 'move') {
		assertChecksum(value.checksum);
		if (typeof value.previousPath !== 'string') throw new Error('Persisted move has no source path.');
		assertPortablePath(value.previousPath);
	}
	let receipt: PersistedOutboxEntry['receipt'];
	if (value.receipt !== undefined) {
		if (!isRecord(value.receipt)) throw new Error('Persisted outbox receipt is invalid.');
		const statuses = new Set(['applied', 'duplicate', 'conflict']);
		if (
			typeof value.receipt.operationId !== 'string' ||
			value.receipt.operationId !== value.operationId ||
			typeof value.receipt.cursor !== 'string' ||
			typeof value.receipt.objectId !== 'string' ||
			value.receipt.objectId !== value.objectId ||
			typeof value.receipt.status !== 'string' ||
			!statuses.has(value.receipt.status) ||
			!(value.receipt.checksum === null || typeof value.receipt.checksum === 'string') ||
			!(value.receipt.conflictId === undefined || typeof value.receipt.conflictId === 'string')
		) throw new Error('Persisted outbox receipt identity is invalid.');
		if (value.receipt.checksum !== null) assertChecksum(value.receipt.checksum);
		if (value.receipt.status === 'conflict' && typeof value.receipt.conflictId !== 'string') {
			throw new Error('Persisted conflict receipt has no conflict identity.');
		}
		receipt = {
			operationId: value.receipt.operationId,
			cursor: value.receipt.cursor,
			objectId: value.receipt.objectId,
			checksum: value.receipt.checksum,
			status: value.receipt.status as NonNullable<PersistedOutboxEntry['receipt']>['status'],
			...(typeof value.receipt.conflictId === 'string' ? { conflictId: value.receipt.conflictId } : {}),
		};
	}
	return {
		operationId: value.operationId,
		objectId: value.objectId,
		path: value.path,
		kind,
		checksum: value.checksum,
		baseChecksum: value.baseChecksum,
		size,
		contentType,
		...(typeof value.previousPath === 'string' ? { previousPath: value.previousPath } : {}),
		previewId: value.previewId,
		serverRevision: value.serverRevision,
		previewCursor: value.previewCursor,
		...(receipt === undefined ? {} : { receipt }),
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
		schemaVersion: 5,
		cursor: null,
		objects: [],
		outbox: [],
		pendingMoves: [],
		conflicts: [],
		recentOperationIds: [],
	};
}

export function hydrateSyncState(value: unknown): PersistedSyncState {
	if (!isRecord(value) || ![1, 2, 3, 4, 5].includes(value.schemaVersion as number)) {
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
	const conflicts = value.schemaVersion === 4 || value.schemaVersion === 5
		? (() => {
			if (!Array.isArray(value.conflicts)) throw new Error('Persisted conflicts are invalid.');
			const parsed = value.conflicts.map(parseConflict);
			if (new Set(parsed.map((conflict) => conflict.conflictId)).size !== parsed.length || new Set(parsed.map((conflict) => conflict.objectId)).size !== parsed.length) {
				throw new Error('Persisted conflicts contain duplicate identities.');
			}
			return parsed;
		})()
		: [];
	const pendingMoves = value.schemaVersion === 5
		? (() => {
			if (!Array.isArray(value.pendingMoves)) throw new Error('Persisted pending moves are invalid.');
			const parsed = value.pendingMoves.map(parsePendingMove);
			const objectIds = new Set<string>();
			const targets = new Set<string>();
			for (const move of parsed) {
				const object = objects.find((candidate) => candidate.objectId === move.objectId);
				if (object === undefined || portablePathKey(object.path) !== portablePathKey(move.previousPath)) {
					throw new Error('Persisted pending move does not match object state.');
				}
				const targetKey = portablePathKey(move.path);
				if (objectIds.has(move.objectId) || targets.has(targetKey)) {
					throw new Error('Persisted pending moves contain duplicate identities.');
				}
				objectIds.add(move.objectId);
				targets.add(targetKey);
			}
			return parsed;
		})()
		: [];
	return {
		schemaVersion: 5,
		cursor: value.cursor,
		objects,
		outbox: value.outbox.map(parseOutbox),
		pendingMoves,
		conflicts,
		recentOperationIds,
	};
}

export function recordPendingMove(state: PersistedSyncState, previousPath: string, path: string): PersistedSyncState {
	assertPortablePath(previousPath);
	assertPortablePath(path);
	const previousKey = portablePathKey(previousPath);
	const pathKey = portablePathKey(path);
	if (previousKey === pathKey) return state;
	const chained = state.pendingMoves.find((move) => portablePathKey(move.path) === previousKey);
	if (chained !== undefined) {
		const pendingMoves = portablePathKey(chained.previousPath) === pathKey
			? state.pendingMoves.filter((move) => move.objectId !== chained.objectId)
			: state.pendingMoves.map((move) => move.objectId === chained.objectId ? { ...move, path } : move);
		return hydrateSyncState({ ...state, pendingMoves });
	}
	const object = state.objects.find((candidate) => portablePathKey(candidate.path) === previousKey);
	if (object === undefined) return state;
	return hydrateSyncState({
		...state,
		pendingMoves: [...state.pendingMoves.filter((move) => move.objectId !== object.objectId), {
			objectId: object.objectId,
			previousPath: object.path,
			path,
		}],
	});
}

export function serializeSyncState(state: PersistedSyncState): string {
	return JSON.stringify(hydrateSyncState(state));
}
