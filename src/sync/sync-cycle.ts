import type {
	ApplyOperation,
	PreviewItem,
	PreviewResult,
	SyncApi,
	SyncChange,
} from '../api/sync-client';
import { shouldSuppressEcho } from './core';
import { portablePathKey } from './portable-path';
import type {
	PersistedObjectState,
	PersistedOutboxEntry,
	PersistedSyncState,
	ReplicaEntry,
	SyncChecksum,
} from './types';

const MAX_RECENT_OPERATION_IDS = 256;

export interface LocalReplica {
	inventory(): Promise<ReplicaEntry[]>;
	read(path: string): Promise<ArrayBuffer>;
	write(path: string, content: ArrayBuffer): Promise<void>;
	delete(path: string): Promise<void>;
	move(previousPath: string, path: string): Promise<void>;
}

export interface SyncCycleOptions {
	state: PersistedSyncState;
	deviceId: string;
	include: string[];
	exclude: string[];
	operationId(): string;
	checksum(content: ArrayBuffer): Promise<SyncChecksum>;
	base64(content: ArrayBuffer): string;
	persistState(state: PersistedSyncState): Promise<void> | void;
	changesLimit?: number;
	confirmInitialPreview?(preview: PreviewResult): Promise<boolean>;
}

function cloneState(state: PersistedSyncState): PersistedSyncState {
	return {
		schemaVersion: 3,
		cursor: state.cursor,
		objects: state.objects.map((object) => ({ ...object })),
		outbox: state.outbox.map((entry) => ({ ...entry })),
		recentOperationIds: [...state.recentOperationIds],
	};
}

async function persist(
	options: SyncCycleOptions,
	state: PersistedSyncState,
): Promise<void> {
	await options.persistState(cloneState(state));
}

function requiresManualResolution(item: PreviewItem): boolean {
	return item.action === 'conflict';
}

function setObject(
	state: PersistedSyncState,
	object: PersistedObjectState,
): void {
	const pathKey = portablePathKey(object.path);
	const collision = state.objects.find(
		(candidate) =>
			candidate.objectId !== object.objectId &&
			portablePathKey(candidate.path) === pathKey,
	);
	if (collision !== undefined) {
		throw new Error(`Remote path '${object.path}' collides with local object state.`);
	}
	state.objects = [
		...state.objects.filter((candidate) => candidate.objectId !== object.objectId),
		object,
	];
}

function removeObject(state: PersistedSyncState, objectId: string): void {
	state.objects = state.objects.filter((object) => object.objectId !== objectId);
}

function removeInventoryPath(inventory: ReplicaEntry[], path: string): void {
	const key = portablePathKey(path);
	const index = inventory.findIndex((entry) => portablePathKey(entry.path) === key);
	if (index !== -1) inventory.splice(index, 1);
}

function upsertInventory(inventory: ReplicaEntry[], entry: ReplicaEntry): void {
	removeInventoryPath(inventory, entry.path);
	inventory.push(entry);
}

function rememberOperations(
	state: PersistedSyncState,
	operationIds: string[],
): void {
	const combined = [...state.recentOperationIds, ...operationIds];
	state.recentOperationIds = [...new Set(combined)].slice(
		-MAX_RECENT_OPERATION_IDS,
	);
}

async function verifiedRemoteContent(
	client: SyncApi,
	local: LocalReplica,
	path: string,
	expectedChecksum: SyncChecksum,
	options: SyncCycleOptions,
): Promise<void> {
	const content = await client.readContent(path);
	if ((await options.checksum(content)) !== expectedChecksum) {
		throw new Error(`Remote file changed after synchronization snapshot at '${path}'.`);
	}
	await local.write(path, content);
	if ((await options.checksum(await local.read(path))) !== expectedChecksum) {
		throw new Error(`Vault write verification failed at '${path}'.`);
	}
}

function localEntryByPath(
	inventory: ReplicaEntry[],
	path: string,
): ReplicaEntry | undefined {
	const key = portablePathKey(path);
	return inventory.find((entry) => portablePathKey(entry.path) === key);
}

async function applyRemoteChange(
	client: SyncApi,
	local: LocalReplica,
	change: SyncChange,
	state: PersistedSyncState,
	options: SyncCycleOptions,
	inventory: ReplicaEntry[],
): Promise<void> {
	const base = state.objects.find((object) => object.objectId === change.objectId);
	const sourcePath = change.kind === 'move' ? change.previousPath : change.path;
	const localEntry = localEntryByPath(inventory, sourcePath);
	const echoIds = new Set([
		...state.recentOperationIds,
		...state.outbox.map((entry) => entry.operationId),
	]);

	if (shouldSuppressEcho(change, options.deviceId, echoIds)) {
		if (change.kind === 'delete') {
			if (localEntry !== undefined) throw new Error(`Local delete echo verification failed at '${change.path}'.`);
			removeObject(state, change.objectId);
		} else {
			const target = localEntryByPath(inventory, change.path);
			if (target?.checksum !== change.checksum) throw new Error(`Local echo verification failed at '${change.path}'.`);
			setObject(state, { objectId: change.objectId, path: change.path, checksum: change.checksum });
		}
		state.recentOperationIds = state.recentOperationIds.filter(
			(operationId) => operationId !== change.operationId,
		);
		return;
	}

	if (change.kind === 'delete') {
		if (base === undefined || base.checksum !== change.baseChecksum) {
			throw new Error(`Remote delete has no matching base at '${change.path}'.`);
		}
		if (localEntry !== undefined && localEntry.checksum !== base.checksum) {
			throw new Error(`Concurrent local change detected at '${change.path}'.`);
		}
		if (localEntry !== undefined) await local.delete(localEntry.path);
		removeInventoryPath(inventory, sourcePath);
		removeObject(state, change.objectId);
		return;
	}

	if (change.kind === 'move') {
		if (base === undefined || portablePathKey(base.path) !== portablePathKey(change.previousPath) || base.checksum !== change.baseChecksum) {
			throw new Error(`Remote move has no matching base at '${change.previousPath}'.`);
		}
		const target = localEntryByPath(inventory, change.path);
		if (localEntry === undefined || localEntry.checksum !== base.checksum || target !== undefined) {
			throw new Error(`Concurrent local change detected at '${change.previousPath}'.`);
		}
		await local.move(change.previousPath, change.path);
		removeInventoryPath(inventory, change.previousPath);
		if (change.checksum !== base.checksum) {
			await verifiedRemoteContent(client, local, change.path, change.checksum, options);
		}
		upsertInventory(inventory, { objectId: change.objectId, path: change.path, checksum: change.checksum, size: change.size, contentType: change.contentType });
		setObject(state, { objectId: change.objectId, path: change.path, checksum: change.checksum });
		return;
	}

	if (
		localEntry !== undefined &&
		localEntry.checksum !== change.checksum &&
		(base === undefined ||
			portablePathKey(base.path) !== portablePathKey(change.path) ||
			localEntry.checksum !== base.checksum)
	) {
		throw new Error(`Concurrent local change detected at '${change.path}'.`);
	}
	if (localEntry === undefined && base !== undefined) {
		throw new Error(`Concurrent local deletion detected at '${change.path}'.`);
	}

	if (localEntry?.checksum !== change.checksum) {
		await verifiedRemoteContent(
			client,
			local,
			change.path,
			change.checksum,
			options,
		);
		const nextEntry: ReplicaEntry = {
			objectId: change.objectId,
			path: change.path,
			checksum: change.checksum,
			size: change.size,
			contentType: change.contentType,
		};
		upsertInventory(inventory, nextEntry);
	}
	setObject(state, {
		objectId: change.objectId,
		path: change.path,
		checksum: change.checksum,
	});
}

async function pullOrderedChanges(
	client: SyncApi,
	local: LocalReplica,
	state: PersistedSyncState,
	options: SyncCycleOptions,
): Promise<void> {
	if (state.cursor === null) return;
	const inventory = await local.inventory();
	for (;;) {
		const requestedCursor: string | null = state.cursor;
		if (typeof requestedCursor !== 'string') return;
		const page = await client.changes(
			requestedCursor,
			options.changesLimit ?? 100,
		);
		for (const change of page.changes) {
			await applyRemoteChange(client, local, change, state, options, inventory);
			state.cursor = change.cursor;
			await persist(options, state);
		}
		if (state.cursor !== page.nextCursor) {
			state.cursor = page.nextCursor;
			await persist(options, state);
		}
		if (!page.hasMore) return;
		if (state.cursor === requestedCursor) {
			throw new Error('ABCM changes page did not advance the cursor.');
		}
	}
}

async function operationFromOutbox(
	local: LocalReplica,
	entry: PersistedOutboxEntry,
	options: SyncCycleOptions,
): Promise<ApplyOperation> {
	if (entry.kind === 'delete') {
		if (localEntryByPath(await local.inventory(), entry.path) !== undefined || entry.baseChecksum === null) {
			throw new Error(`Queued local delete is no longer valid at '${entry.path}'.`);
		}
		return { operationId: entry.operationId, objectId: entry.objectId, path: entry.path, kind: 'delete', baseChecksum: entry.baseChecksum };
	}
	const content = await local.read(entry.path);
	if (
		entry.checksum === null || entry.size === null || content.byteLength !== entry.size ||
		(await options.checksum(content)) !== entry.checksum
	) {
		throw new Error(`Queued local file changed before acknowledgement at '${entry.path}'.`);
	}
	if (entry.kind === 'move') {
		if (entry.baseChecksum === null || entry.previousPath == null) throw new Error(`Queued local move is incomplete at '${entry.path}'.`);
		return { operationId: entry.operationId, objectId: entry.objectId, path: entry.path, kind: 'move', previousPath: entry.previousPath, checksum: entry.checksum, baseChecksum: entry.baseChecksum };
	}
	return {
		operationId: entry.operationId,
		objectId: entry.objectId,
		path: entry.path,
		kind: entry.kind,
		checksum: entry.checksum,
		...(entry.baseChecksum === null
			? {}
			: { baseChecksum: entry.baseChecksum }),
		contentBase64: options.base64(content),
		contentType: entry.contentType ?? 'application/octet-stream',
		size: entry.size,
	};
}

async function flushOutbox(
	client: SyncApi,
	local: LocalReplica,
	state: PersistedSyncState,
	options: SyncCycleOptions,
): Promise<void> {
	if (state.outbox.length === 0) return;
	const first = state.outbox[0];
	if (first === undefined) return;
	if (
		state.outbox.some(
			(entry) =>
				entry.previewId !== first.previewId ||
				entry.serverRevision !== first.serverRevision ||
				entry.previewCursor !== first.previewCursor,
		)
	) {
		throw new Error('Persisted outbox contains operations from different previews.');
	}
	const operations = await Promise.all(
		state.outbox.map((entry) => operationFromOutbox(local, entry, options)),
	);
	const preview: PreviewResult = {
		previewId: first.previewId,
		serverRevision: first.serverRevision,
		cursor: first.previewCursor,
		items: [],
	};
	const result = await client.apply(preview, operations);
	if (
		result.receipts.length !== operations.length ||
		result.receipts.some(
			(receipt, index) => receipt.operationId !== operations[index]?.operationId,
		)
	) {
		throw new Error('ABCM apply receipts do not match the durable outbox.');
	}
	const conflict = result.receipts.find((receipt) => receipt.status === 'conflict');
	if (conflict !== undefined) {
		throw new Error(`ABCM reported sync conflict '${conflict.conflictId ?? 'unknown'}'.`);
	}
	const queued = state.outbox;
	for (const [index, entry] of queued.entries()) {
		const receipt = result.receipts[index];
		if (receipt === undefined) continue;
		if (entry.kind === 'delete') {
			removeObject(state, receipt.objectId);
		} else {
			const checksum = receipt.checksum ?? entry.checksum;
			if (checksum === null) throw new Error(`ABCM returned no checksum for '${entry.path}'.`);
			setObject(state, { objectId: receipt.objectId, path: entry.path, checksum });
		}
	}
	rememberOperations(
		state,
		result.receipts.map((receipt) => receipt.operationId),
	);
	state.cursor = result.receipts.at(-1)?.cursor ?? state.cursor;
	state.outbox = [];
	await persist(options, state);
}

async function applyPreviewPulls(
	client: SyncApi,
	local: LocalReplica,
	preview: PreviewResult,
	inventory: ReplicaEntry[],
	state: PersistedSyncState,
	options: SyncCycleOptions,
): Promise<void> {
	for (const item of preview.items) {
		if (item.action === 'noop' && item.objectId !== null && item.serverChecksum !== null) {
			setObject(state, {
				objectId: item.objectId,
				path: item.path,
				checksum: item.serverChecksum,
			});
		}
		if (item.action === 'delete-local') {
			if (item.objectId === null) throw new Error(`Remote delete identity is incomplete at '${item.path}'.`);
			const base = state.objects.find((object) => object.objectId === item.objectId);
			const localEntry = localEntryByPath(inventory, item.path);
			if (base === undefined || (localEntry !== undefined && localEntry.checksum !== base.checksum)) throw new Error(`Concurrent local change detected at '${item.path}'.`);
			if (localEntry !== undefined) await local.delete(localEntry.path);
			removeInventoryPath(inventory, item.path);
			removeObject(state, item.objectId);
			continue;
		}
		if (item.action === 'move-local') {
			if (item.objectId === null || item.serverChecksum === null || item.previousPath === undefined) throw new Error(`Remote move identity is incomplete at '${item.path}'.`);
			const base = state.objects.find((object) => object.objectId === item.objectId);
			const source = localEntryByPath(inventory, item.previousPath);
			if (base === undefined || source?.checksum !== base.checksum || localEntryByPath(inventory, item.path) !== undefined) throw new Error(`Concurrent local change detected at '${item.previousPath}'.`);
			await local.move(item.previousPath, item.path);
			removeInventoryPath(inventory, item.previousPath);
			if (item.serverChecksum !== base.checksum) await verifiedRemoteContent(client, local, item.path, item.serverChecksum, options);
			upsertInventory(inventory, { objectId: item.objectId, path: item.path, checksum: item.serverChecksum, size: item.size ?? source.size, contentType: source.contentType });
			setObject(state, { objectId: item.objectId, path: item.path, checksum: item.serverChecksum });
			continue;
		}
		if (item.action !== 'create-local' && item.action !== 'update-local') continue;
		if (item.objectId === null || item.serverChecksum === null) {
			throw new Error(`Remote preview identity is incomplete at '${item.path}'.`);
		}
		const localEntry = localEntryByPath(inventory, item.path);
		const base = state.objects.find((object) => object.objectId === item.objectId);
		if (
			localEntry !== undefined &&
			localEntry.checksum !== item.serverChecksum &&
			(base === undefined || localEntry.checksum !== base.checksum)
		) {
			throw new Error(`Concurrent local change detected at '${item.path}'.`);
		}
		if (localEntry?.checksum !== item.serverChecksum) {
			await verifiedRemoteContent(
				client,
				local,
				item.path,
				item.serverChecksum,
				options,
			);
		}
		setObject(state, {
			objectId: item.objectId,
			path: item.path,
			checksum: item.serverChecksum,
		});
	}
}

async function queuePreviewPushes(
	local: LocalReplica,
	preview: PreviewResult,
	inventory: ReplicaEntry[],
	state: PersistedSyncState,
	options: SyncCycleOptions,
): Promise<void> {
	const entries: PersistedOutboxEntry[] = [];
	for (const item of preview.items) {
		if (!['create-server', 'update-server', 'delete-server', 'move-server'].includes(item.action)) {
			continue;
		}
		if (item.objectId === null) throw new Error(`Pinned preview has no object identity at '${item.path}'.`);
		if (item.action === 'delete-server') {
			const base = state.objects.find((object) => object.objectId === item.objectId);
			if (base === undefined || item.serverChecksum === null || base.checksum !== item.serverChecksum || localEntryByPath(inventory, item.path) !== undefined) throw new Error(`Pinned delete differs from local state at '${item.path}'.`);
			entries.push({ operationId: options.operationId(), objectId: item.objectId, path: item.path, kind: 'delete', checksum: null, baseChecksum: item.serverChecksum, size: null, contentType: null, previewId: preview.previewId, serverRevision: preview.serverRevision, previewCursor: preview.cursor });
			continue;
		}
		const entry = localEntryByPath(inventory, item.path);
		if (entry === undefined) {
			throw new Error(`Pinned preview differs from local inventory at '${item.path}'.`);
		}
		const content = await local.read(item.path);
		if (
			content.byteLength !== entry.size ||
			(await options.checksum(content)) !== entry.checksum
		) {
			throw new Error(`Local file changed after preview at '${item.path}'.`);
		}
		if (item.action === 'update-server' && item.serverChecksum === null) {
			throw new Error(`Update preview has no base checksum at '${item.path}'.`);
		}
		if (item.action === 'move-server') {
			const base = state.objects.find((object) => object.objectId === item.objectId);
			if (item.previousPath === undefined || item.serverChecksum === null || base === undefined || base.checksum !== item.serverChecksum || entry.checksum !== base.checksum) throw new Error(`Pinned move differs from local state at '${item.path}'.`);
			entries.push({ operationId: options.operationId(), objectId: item.objectId, path: item.path, kind: 'move', checksum: entry.checksum, baseChecksum: item.serverChecksum, size: entry.size, contentType: entry.contentType ?? 'application/octet-stream', previousPath: item.previousPath, previewId: preview.previewId, serverRevision: preview.serverRevision, previewCursor: preview.cursor });
			continue;
		}
		entries.push({
			operationId: options.operationId(),
			objectId: item.objectId,
			path: item.path,
			kind: item.action === 'create-server' ? 'create' : 'update',
			checksum: entry.checksum,
			baseChecksum:
				item.action === 'update-server' ? item.serverChecksum : null,
			size: entry.size,
			contentType: entry.contentType ?? 'application/octet-stream',
			previewId: preview.previewId,
			serverRevision: preview.serverRevision,
			previewCursor: preview.cursor,
		});
	}
	if (entries.length > 100) {
		throw new Error('Pinned preview exceeds the supported 100-operation batch.');
	}
	if (entries.length > 0) {
		state.outbox = entries;
		await persist(options, state);
	}
}

export async function runSyncCycle(
	client: SyncApi,
	local: LocalReplica,
	options: SyncCycleOptions,
): Promise<PersistedSyncState> {
	const state = cloneState(options.state);

	await pullOrderedChanges(client, local, state, options);
	await flushOutbox(client, local, state, options);

	const inventory = await local.inventory();
	const preview = await client.preview(
		state.cursor,
		inventory,
		options.include,
		options.exclude,
		state.objects,
	);
	const blocked = preview.items.find(requiresManualResolution);
	if (blocked !== undefined) {
		throw new Error(`Sync requires manual resolution for '${blocked.path}'.`);
	}
	if (state.cursor === null) {
		const confirmed = await options.confirmInitialPreview?.(preview) ?? false;
		if (!confirmed) throw new Error('Initial synchronization was not confirmed.');
	}

	await applyPreviewPulls(client, local, preview, inventory, state, options);
	state.cursor = preview.cursor;
	await persist(options, state);
	await queuePreviewPushes(local, preview, inventory, state, options);
	await flushOutbox(client, local, state, options);
	await pullOrderedChanges(client, local, state, options);

	return state;
}
