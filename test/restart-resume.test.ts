import { describe, expect, it } from 'vitest';
import { AbcmSyncHttpError, type ApplyOperation, type SyncApi } from '../src/api/sync-client';
import {
	createInitialSyncState,
	runSyncCycle,
	type LocalReplica,
	type PersistedSyncState,
	type ReplicaEntry,
	type SyncChecksum,
} from '../src/sync';

const digest = (value: string): SyncChecksum => `sha256:${value.repeat(64)}`;
const bytes = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const checksum = (content: ArrayBuffer): Promise<SyncChecksum> =>
	Promise.resolve(digest(new TextDecoder().decode(content)));

class MemoryReplica implements LocalReplica {
	readonly artifacts = new Map<string, ArrayBuffer>();

	constructor(private readonly files: Map<string, ArrayBuffer>) {}

	inventory(): Promise<ReplicaEntry[]> {
		return Promise.all([...this.files.entries()].map(async ([path, content]) => ({
			objectId: null,
			path,
			checksum: await checksum(content),
			size: content.byteLength,
			contentType: 'text/markdown',
		})));
	}

	read(path: string): Promise<ArrayBuffer> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing '${path}'.`);
		return Promise.resolve(content);
	}

	write(path: string, content: ArrayBuffer): Promise<void> {
		this.files.set(path, content);
		return Promise.resolve();
	}

	delete(path: string): Promise<void> {
		this.files.delete(path);
		return Promise.resolve();
	}

	move(previousPath: string, path: string): Promise<void> {
		const content = this.files.get(previousPath);
		if (content === undefined) throw new Error('Missing move source.');
		this.files.delete(previousPath);
		this.files.set(path, content);
		return Promise.resolve();
	}

	writeConflictArtifact(conflictId: string, sourcePath: string, content: ArrayBuffer): Promise<string> {
		const path = `_ABCM Conflicts/${conflictId}/server-${sourcePath}`;
		this.artifacts.set(path, content.slice(0));
		return Promise.resolve(path);
	}
}

describe('expired cursor recovery', () => {
	it('replays the durable outbox before recovering an expired change cursor', async () => {
		const oldOperationId = 'op_old00000001';
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_expired',
			objects: [{ objectId: 'obj_00000001', path: 'a.md', checksum: digest('a') }],
			outbox: [{
				operationId: oldOperationId,
				objectId: 'obj_00000001',
				path: 'a.md',
				kind: 'update',
				checksum: digest('b'),
				baseChecksum: digest('a'),
				size: 1,
				contentType: 'text/markdown',
				previewId: 'preview_expired',
				serverRevision: 'revision-expired',
				previewCursor: 'cursor_expired',
			}],
		};
		const persisted: PersistedSyncState[] = [];
		const applied: ApplyOperation[] = [];
		let changesCalls = 0;
		let confirmCalls = 0;
		const client: SyncApi = {
			changes: (cursor) => {
				changesCalls += 1;
				if (changesCalls === 1) {
					return Promise.reject(new AbcmSyncHttpError('expired', 409, 'SYNC_CURSOR_EXPIRED'));
				}
				return Promise.resolve({ changes: [], nextCursor: cursor, hasMore: false });
			},
			preview: (cursor, inventory, _include, _exclude, base) => {
				expect(cursor).toBeNull();
				expect(base).toEqual([{ objectId: 'obj_00000001', path: 'a.md', checksum: digest('b') }]);
				expect(inventory[0]?.checksum).toBe(digest('b'));
				return Promise.resolve({
					previewId: 'preview_fresh',
					serverRevision: 'revision-fresh',
					cursor: 'cursor_fresh',
					items: [{
						action: 'update-server',
						objectId: 'obj_00000001',
						path: 'a.md',
						localChecksum: digest('b'),
						serverChecksum: digest('a'),
						size: 1,
					}],
				});
			},
			apply: (_preview, operations) => {
				applied.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'applied',
					operationId: operations[0]?.operationId ?? '',
					cursor: 'cursor_applied',
					objectId: 'obj_00000001',
					checksum: digest('b'),
				}] });
			},
			readContent: () => Promise.resolve(bytes('b')),
		};

		const result = await runSyncCycle(client, new MemoryReplica(new Map([['a.md', bytes('b')]])), {
			state,
			deviceId: 'device_00000001',
			include: [],
			exclude: [],
			operationId: () => 'op_fresh000001',
			checksum,
			base64: () => 'Yg==',
			confirmInitialPreview: () => {
				confirmCalls += 1;
				return Promise.resolve(false);
			},
			persistState: (next) => { persisted.push(structuredClone(next)); },
		});

		expect(persisted.some((snapshot) => snapshot.cursor === null && snapshot.outbox.length === 0)).toBe(true);
		expect(applied).toEqual([
			expect.objectContaining({ operationId: oldOperationId, kind: 'update', checksum: digest('b'), baseChecksum: digest('a') }),
			expect.objectContaining({ operationId: 'op_fresh000001', kind: 'update', checksum: digest('b'), baseChecksum: digest('b') }),
		]);
		expect(confirmCalls).toBe(0);
		expect(result).toMatchObject({ cursor: 'cursor_applied', outbox: [] });
	});

	it('recovers from a stale ordered event without weakening content verification', async () => {
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_before_remote',
			objects: [{ objectId: 'obj_base000001', path: 'base.md', checksum: digest('a') }],
		};
		const replica = new MemoryReplica(new Map([['base.md', bytes('a')]]));
		const persisted: PersistedSyncState[] = [];
		let changesCalls = 0;
		let previewCalls = 0;
		const client: SyncApi = {
			changes: (cursor) => {
				changesCalls += 1;
				if (changesCalls === 1) {
					expect(cursor).toBe('cursor_before_remote');
					return Promise.resolve({
						changes: [{
							kind: 'create',
							cursor: 'cursor_remote_create',
							objectId: 'obj_remote00001',
							operationId: 'op_remote000001',
							originDeviceId: null,
							path: 'remote.md',
							occurredAt: '2026-08-18T00:00:00.000Z',
							checksum: digest('b'),
							size: 1,
							contentType: 'text/markdown',
							tombstone: false,
						}],
						nextCursor: 'cursor_remote_create',
						hasMore: false,
					});
				}
				return Promise.resolve({ changes: [], nextCursor: cursor, hasMore: false });
			},
			preview: (cursor, inventory, _include, _exclude, base) => {
				previewCalls += 1;
				expect(cursor).toBeNull();
				expect(base).toEqual(state.objects);
				expect(inventory).toHaveLength(1);
				return Promise.resolve({
					previewId: 'preview_current',
					serverRevision: 'revision-current',
					cursor: 'cursor_remote_update',
					items: [{
						action: 'create-local',
						objectId: 'obj_remote00001',
						path: 'remote.md',
						localChecksum: null,
						serverChecksum: digest('c'),
						size: 1,
					}],
				});
			},
			readContent: () => Promise.resolve(bytes('c')),
			apply: () => Promise.reject(new Error('Unexpected apply.')),
		};

		const result = await runSyncCycle(client, replica, {
			state,
			deviceId: 'device_00000001',
			include: [],
			exclude: [],
			operationId: () => 'op_unexpected01',
			checksum,
			base64: () => { throw new Error('Unexpected base64 encoding.'); },
			confirmInitialPreview: () => Promise.reject(new Error('Unexpected confirmation.')),
			persistState: (next) => { persisted.push(structuredClone(next)); },
		});

		expect(previewCalls).toBe(1);
		expect(persisted.some((snapshot) => snapshot.cursor === null)).toBe(true);
		expect(new TextDecoder().decode(await replica.read('remote.md'))).toBe('c');
		expect(result.cursor).toBe('cursor_remote_update');
		expect(result.objects.find((object) => object.objectId === 'obj_remote00001')).toEqual({
			objectId: 'obj_remote00001',
			path: 'remote.md',
			checksum: digest('c'),
		});
	});

	it('resnapshots a pull-time concurrent update into an explicit conflict', async () => {
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_base',
			objects: [{ objectId: 'obj_note000001', path: 'note.md', checksum: digest('a') }],
		};
		const replica = new MemoryReplica(new Map([['note.md', bytes('b')]]));
		const persisted: PersistedSyncState[] = [];
		const applied: ApplyOperation[] = [];
		let changesCalls = 0;
		const client: SyncApi = {
			changes: (cursor) => {
				changesCalls += 1;
				if (changesCalls === 1) {
					expect(cursor).toBe('cursor_base');
					return Promise.resolve({
						changes: [{
							kind: 'update',
							cursor: 'cursor_server_update',
							objectId: 'obj_note000001',
							operationId: 'op_server_update',
							originDeviceId: null,
							path: 'note.md',
							occurredAt: '2026-08-18T00:00:00.000Z',
							baseChecksum: digest('a'),
							checksum: digest('c'),
							size: 1,
							contentType: 'text/markdown',
							tombstone: false,
						}],
						nextCursor: 'cursor_server_update',
						hasMore: false,
					});
				}
				return Promise.resolve({ changes: [], nextCursor: cursor, hasMore: false });
			},
			preview: (cursor, inventory, _include, _exclude, base) => {
				expect(cursor).toBeNull();
				expect(base).toEqual(state.objects);
				expect(inventory).toEqual([expect.objectContaining({ path: 'note.md', checksum: digest('b') })]);
				return Promise.resolve({
					previewId: 'preview_conflict',
					serverRevision: 'revision-conflict',
					cursor: 'cursor_server_update',
					items: [{
						action: 'conflict',
						objectId: 'obj_note000001',
						path: 'note.md',
						localChecksum: digest('b'),
						serverChecksum: digest('c'),
						size: 1,
					}],
				});
			},
			apply: (_preview, operations) => {
				applied.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'conflict',
					operationId: operations[0]?.operationId ?? '',
					cursor: 'cursor_conflict',
					objectId: 'obj_note000001',
					checksum: null,
					conflictId: 'conflict_00000001',
				}] });
			},
			getConflict: () => Promise.resolve({
				conflictId: 'conflict_00000001',
				objectId: 'obj_note000001',
				kind: 'concurrent-update',
				path: 'note.md',
				localPath: 'note.md',
				serverPath: 'note.md',
				local: { state: 'present', checksum: digest('b'), size: 1, contentType: 'text/markdown' },
				server: { state: 'present', checksum: digest('c'), size: 1, contentType: 'text/markdown' },
				baseChecksum: digest('a'),
				status: 'open',
			}),
			readContent: () => Promise.resolve(bytes('c')),
		};

		const result = await runSyncCycle(client, replica, {
			state,
			deviceId: 'device_00000001',
			include: [],
			exclude: [],
			operationId: () => 'op_local_update',
			checksum,
			base64: () => 'Yg==',
			persistState: (next) => { persisted.push(structuredClone(next)); },
		});

		expect(persisted.some((snapshot) => snapshot.cursor === null)).toBe(true);
		expect(applied).toEqual([expect.objectContaining({ kind: 'update', baseChecksum: digest('a'), checksum: digest('b') })]);
		expect(new TextDecoder().decode(await replica.read('note.md'))).toBe('b');
		expect([...replica.artifacts.values()].map((content) => new TextDecoder().decode(content))).toEqual(['c']);
		expect(result).toMatchObject({ cursor: 'cursor_conflict', outbox: [], conflicts: [{ conflictId: 'conflict_00000001' }] });
	});
});
