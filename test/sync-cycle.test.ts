import { describe, expect, it } from 'vitest';
import type {
	ApplyOperation,
	ChangesResult,
	PreviewResult,
	SyncApi,
} from '../src/api/sync-client';
import {
	createInitialSyncState,
	runSyncCycle,
	type LocalReplica,
	type PersistedSyncState,
	type ReplicaEntry,
	type SyncChecksum,
} from '../src/sync';

const digest = (value: string): SyncChecksum => `sha256:${value.repeat(64)}`;
const bytes = (value: string): ArrayBuffer =>
	new TextEncoder().encode(value).buffer;
const checksum = (content: ArrayBuffer): Promise<SyncChecksum> =>
	Promise.resolve(digest(new TextDecoder().decode(content)));

class MemoryReplica implements LocalReplica {
	readonly writes: string[] = [];
	failWrite = false;

	constructor(private readonly files: Map<string, ArrayBuffer>) {}

	inventory(): Promise<ReplicaEntry[]> {
		return Promise.all(
			[...this.files.entries()].map(async ([path, content]) => ({
				objectId: null,
				path,
				checksum: await checksum(content),
				size: content.byteLength,
				contentType: 'text/markdown',
			})),
		);
	}

	read(path: string): Promise<ArrayBuffer> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing local file '${path}'.`);
		return Promise.resolve(content);
	}

	write(path: string, content: ArrayBuffer): Promise<void> {
		if (this.failWrite) throw new Error('Simulated vault write failure.');
		this.writes.push(path);
		this.files.set(path, content);
		return Promise.resolve();
	}

	delete(path: string): Promise<void> {
		if (!this.files.delete(path)) throw new Error(`Missing local file '${path}'.`);
		return Promise.resolve();
	}

	move(previousPath: string, path: string): Promise<void> {
		const content = this.files.get(previousPath);
		if (content === undefined || this.files.has(path)) throw new Error('Unsafe local move.');
		this.files.delete(previousPath);
		this.files.set(path, content);
		return Promise.resolve();
	}
}

function emptyChanges(cursor: string): ChangesResult {
	return { changes: [], nextCursor: cursor, hasMore: false };
}

function preview(
	cursor: string,
	items: PreviewResult['items'],
): PreviewResult {
	return {
		previewId: 'preview_00000001',
		serverRevision: 'revision-1',
		cursor,
		items,
	};
}

function cycleOptions(
	state: PersistedSyncState,
	persisted: PersistedSyncState[],
	operationId = () => 'op_00000001',
) {
	return {
		state,
		deviceId: 'device_00000001',
		include: [] as string[],
		exclude: [] as string[],
		operationId,
		checksum,
		base64: () => 'YQ==',
		confirmInitialPreview: () => Promise.resolve(true),
		persistState: (next: PersistedSyncState) => {
			persisted.push(structuredClone(next));
		},
	};
}

describe('restart-safe foreground synchronization cycle', () => {
	it('persists a durable outbox before apply and commits its receipt', async () => {
		const replica = new MemoryReplica(new Map([['a.md', bytes('a')]]));
		const persisted: PersistedSyncState[] = [];
		const applied: ApplyOperation[] = [];
		const client: SyncApi = {
			preview: () => Promise.resolve(preview('cursor_00000001', [{
				action: 'create-server',
				objectId: 'obj_00000001',
				path: 'a.md',
				localChecksum: digest('a'),
				serverChecksum: null,
				size: 1,
			}])),
			changes: (cursor) => Promise.resolve(emptyChanges(cursor)),
			readContent: () => Promise.resolve(bytes('a')),
			apply: (_pinned, operations) => {
				expect(persisted.some((state) => state.outbox.length === 1)).toBe(true);
				applied.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'applied',
					operationId: operations[0]?.operationId ?? '',
					cursor: 'cursor_00000002',
					objectId: 'obj_00000001',
					checksum: digest('a'),
				}] });
			},
		};

		const state = await runSyncCycle(
			client,
			replica,
			cycleOptions(createInitialSyncState(), persisted),
		);

		expect(applied).toHaveLength(1);
		expect(applied[0]).toMatchObject({
			operationId: 'op_00000001',
			kind: 'create',
			path: 'a.md',
		});
		expect(state).toMatchObject({
			cursor: 'cursor_00000002',
			outbox: [],
			objects: [{
				objectId: 'obj_00000001',
				path: 'a.md',
				checksum: digest('a'),
			}],
		});
	});

	it('replays the exact operation identity after a transport failure', async () => {
		const replica = new MemoryReplica(new Map([['a.md', bytes('a')]]));
		const firstPersistence: PersistedSyncState[] = [];
		const failedClient: SyncApi = {
			preview: () => Promise.resolve(preview('cursor_00000001', [{
				action: 'create-server',
				objectId: 'obj_00000001',
				path: 'a.md',
				localChecksum: digest('a'),
				serverChecksum: null,
				size: 1,
			}])),
			changes: (cursor) => Promise.resolve(emptyChanges(cursor)),
			readContent: () => Promise.resolve(bytes('a')),
			apply: () => Promise.reject(new Error('Simulated lost response.')),
		};
		await expect(runSyncCycle(
			failedClient,
			replica,
			cycleOptions(createInitialSyncState(), firstPersistence),
		)).rejects.toThrow('Simulated lost response');
		const restartState = firstPersistence.at(-1);
		expect(restartState?.outbox[0]?.operationId).toBe('op_00000001');

		let generated = 0;
		const replayed: ApplyOperation[] = [];
		const recoveredClient: SyncApi = {
			preview: (_cursor, inventory) => Promise.resolve(preview(
				'cursor_00000002',
				inventory.map((entry) => ({
					action: 'noop' as const,
					objectId: 'obj_00000001',
					path: entry.path,
					localChecksum: entry.checksum,
					serverChecksum: entry.checksum,
					size: entry.size,
				})),
			)),
			changes: (cursor) => Promise.resolve(emptyChanges(cursor)),
			readContent: () => Promise.resolve(bytes('a')),
			apply: (_pinned, operations) => {
				replayed.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'duplicate',
					operationId: operations[0]?.operationId ?? '',
					cursor: 'cursor_00000002',
					objectId: 'obj_00000001',
					checksum: digest('a'),
				}] });
			},
		};
		if (restartState === undefined) throw new Error('Missing restart state.');
		const recovered = await runSyncCycle(
			recoveredClient,
			replica,
			cycleOptions(restartState, [], () => {
				generated += 1;
				return 'op_unexpected01';
			}),
		);
		expect(replayed[0]?.operationId).toBe('op_00000001');
		expect(generated).toBe(0);
		expect(recovered.outbox).toEqual([]);
		expect(recovered.cursor).toBe('cursor_00000002');
	});

	it('pulls ordered pages and suppresses only a verified local echo', async () => {
		const replica = new MemoryReplica(new Map([['a.md', bytes('b')]]));
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_00000001',
			objects: [{ objectId: 'obj_00000001', path: 'a.md', checksum: digest('a') }],
			recentOperationIds: ['op_00000001'],
		};
		const pages: ChangesResult[] = [
			{
				changes: [{
					kind: 'update',
					cursor: 'cursor_00000002',
					objectId: 'obj_00000001',
					operationId: 'op_00000001',
					originDeviceId: 'device_00000001',
					path: 'a.md',
					occurredAt: '2026-08-14T00:00:00.000Z',
					baseChecksum: digest('a'),
					checksum: digest('b'),
					size: 1,
					contentType: 'text/markdown',
					tombstone: false,
				}],
				nextCursor: 'cursor_00000002',
				hasMore: true,
			},
			{
				changes: [{
					kind: 'update',
					cursor: 'cursor_00000003',
					objectId: 'obj_00000001',
					operationId: 'op_00000002',
					originDeviceId: null,
					path: 'a.md',
					occurredAt: '2026-08-14T00:00:01.000Z',
					baseChecksum: digest('b'),
					checksum: digest('c'),
					size: 1,
					contentType: 'text/markdown',
					tombstone: false,
				}],
				nextCursor: 'cursor_00000003',
				hasMore: false,
			},
		];
		const requested: string[] = [];
		const client: SyncApi = {
			preview: () => Promise.resolve(preview('cursor_00000003', [])),
			changes: (cursor) => {
				requested.push(cursor);
				return Promise.resolve(pages.shift() ?? emptyChanges(cursor));
			},
			readContent: () => Promise.resolve(bytes('c')),
			apply: () => Promise.reject(new Error('Unexpected apply.')),
		};
		const persisted: PersistedSyncState[] = [];
		const result = await runSyncCycle(
			client,
			replica,
			cycleOptions(state, persisted),
		);
		expect(requested.slice(0, 2)).toEqual([
			'cursor_00000001',
			'cursor_00000002',
		]);
		expect(replica.writes).toEqual(['a.md']);
		expect(result.cursor).toBe('cursor_00000003');
		expect(result.recentOperationIds).toEqual([]);
		expect(result.objects[0]?.checksum).toBe(digest('c'));
	});

	it('does not advance the cursor when a remote vault write fails', async () => {
		const replica = new MemoryReplica(new Map([['a.md', bytes('a')]]));
		replica.failWrite = true;
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_00000001',
			objects: [{ objectId: 'obj_00000001', path: 'a.md', checksum: digest('a') }],
		};
		const client: SyncApi = {
			preview: () => Promise.reject(new Error('Unexpected preview.')),
			changes: () => Promise.resolve({
				changes: [{
					kind: 'update',
					cursor: 'cursor_00000002',
					objectId: 'obj_00000001',
					operationId: 'op_00000002',
					originDeviceId: null,
					path: 'a.md',
					occurredAt: '2026-08-14T00:00:00.000Z',
					baseChecksum: digest('a'),
					checksum: digest('b'),
					size: 1,
					contentType: 'text/markdown',
					tombstone: false,
				}],
				nextCursor: 'cursor_00000002',
				hasMore: false,
			}),
			readContent: () => Promise.resolve(bytes('b')),
			apply: () => Promise.reject(new Error('Unexpected apply.')),
		};
		const persisted: PersistedSyncState[] = [];
		await expect(runSyncCycle(
			client,
			replica,
			cycleOptions(state, persisted),
		)).rejects.toThrow('Simulated vault write failure');
		expect(state.cursor).toBe('cursor_00000001');
		expect(persisted.at(-1)?.cursor ?? state.cursor).toBe('cursor_00000001');
	});
});
