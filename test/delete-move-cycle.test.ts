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
const bytes = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const checksum = (content: ArrayBuffer): Promise<SyncChecksum> =>
	Promise.resolve(digest(new TextDecoder().decode(content)));

class MutableReplica implements LocalReplica {
	readonly deletes: string[] = [];
	readonly moves: Array<[string, string]> = [];
	readonly writes: string[] = [];

	constructor(readonly files: Map<string, ArrayBuffer>) {}

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
		if (content === undefined) throw new Error(`Missing local file '${path}'.`);
		return Promise.resolve(content);
	}

	write(path: string, content: ArrayBuffer): Promise<void> {
		this.writes.push(path);
		this.files.set(path, content);
		return Promise.resolve();
	}

	delete(path: string): Promise<void> {
		if (!this.files.delete(path)) throw new Error(`Missing local file '${path}'.`);
		this.deletes.push(path);
		return Promise.resolve();
	}

	move(previousPath: string, path: string): Promise<void> {
		const content = this.files.get(previousPath);
		if (content === undefined || this.files.has(path)) throw new Error('Unsafe local move.');
		this.files.delete(previousPath);
		this.files.set(path, content);
		this.moves.push([previousPath, path]);
		return Promise.resolve();
	}
}

function state(path = 'note.md'): PersistedSyncState {
	return {
		...createInitialSyncState(),
		cursor: 'cursor_00000001',
		objects: [{ objectId: 'obj_00000001', path, checksum: digest('a') }],
	};
}

function emptyChanges(cursor: string): ChangesResult {
	return { changes: [], nextCursor: cursor, hasMore: false };
}

function options(current: PersistedSyncState) {
	return {
		state: current,
		deviceId: 'device_00000001',
		include: [] as string[],
		exclude: [] as string[],
		operationId: () => 'op_00000001',
		checksum,
		base64: () => 'YQ==',
		persistState: () => undefined,
	};
}

function preview(items: PreviewResult['items']): PreviewResult {
	return {
		previewId: 'preview_00000001',
		serverRevision: 'revision-1',
		cursor: 'cursor_00000001',
		items,
	};
}

describe('delete and move synchronization cycle', () => {
	it('pushes a checksum-bound local delete and removes the base object', async () => {
		const replica = new MutableReplica(new Map());
		const applied: ApplyOperation[] = [];
		const client: SyncApi = {
			preview: () => Promise.resolve(preview([{
				action: 'delete-server', objectId: 'obj_00000001', path: 'note.md',
				localChecksum: null, serverChecksum: digest('a'), size: 1,
			}])),
			changes: (cursor) => Promise.resolve(emptyChanges(cursor)),
			readContent: () => Promise.reject(new Error('Unexpected content read.')),
			apply: (_pinned, operations) => {
				applied.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'applied', operationId: 'op_00000001', cursor: 'cursor_00000002',
					objectId: 'obj_00000001', checksum: null,
				}] });
			},
		};
		const result = await runSyncCycle(client, replica, options(state()));
		expect(applied).toEqual([expect.objectContaining({
			kind: 'delete', path: 'note.md', baseChecksum: digest('a'),
		})]);
		expect(result.objects).toEqual([]);
		expect(result.cursor).toBe('cursor_00000002');
	});

	it('pushes an identity-preserving local move', async () => {
		const replica = new MutableReplica(new Map([['renamed.md', bytes('a')]]));
		const applied: ApplyOperation[] = [];
		const client: SyncApi = {
			preview: () => Promise.resolve(preview([{
				action: 'move-server', objectId: 'obj_00000001', previousPath: 'note.md', path: 'renamed.md',
				localChecksum: digest('a'), serverChecksum: digest('a'), size: 1,
			}])),
			changes: (cursor) => Promise.resolve(emptyChanges(cursor)),
			readContent: () => Promise.reject(new Error('Unexpected content read.')),
			apply: (_pinned, operations) => {
				applied.push(...operations);
				return Promise.resolve({ receipts: [{
					status: 'applied', operationId: 'op_00000001', cursor: 'cursor_00000002',
					objectId: 'obj_00000001', checksum: digest('a'),
				}] });
			},
		};
		const result = await runSyncCycle(client, replica, options(state()));
		expect(applied).toEqual([expect.objectContaining({
			kind: 'move', previousPath: 'note.md', path: 'renamed.md',
			baseChecksum: digest('a'), checksum: digest('a'),
		})]);
		expect(result.objects).toEqual([{ objectId: 'obj_00000001', path: 'renamed.md', checksum: digest('a') }]);
	});

	it('applies ordered remote delete and move through the local replica', async () => {
		const replica = new MutableReplica(new Map([['note.md', bytes('a')]]));
		const pages: ChangesResult[] = [{
			changes: [{
				kind: 'move', cursor: 'cursor_00000002', objectId: 'obj_00000001',
				operationId: 'op_remote_move01', originDeviceId: null, previousPath: 'note.md', path: 'renamed.md',
				occurredAt: '2026-08-14T00:00:00.000Z', baseChecksum: digest('a'), checksum: digest('a'),
				size: 1, contentType: 'text/markdown', tombstone: false,
			}], nextCursor: 'cursor_00000002', hasMore: true,
		}, {
			changes: [{
				kind: 'delete', cursor: 'cursor_00000003', objectId: 'obj_00000001',
				operationId: 'op_remote_delete1', originDeviceId: null, path: 'renamed.md',
				occurredAt: '2026-08-14T00:00:01.000Z', baseChecksum: digest('a'), tombstone: true,
			}], nextCursor: 'cursor_00000003', hasMore: false,
		}];
		const client: SyncApi = {
			preview: () => Promise.resolve({ ...preview([]), cursor: 'cursor_00000003' }),
			changes: (cursor) => Promise.resolve(pages.shift() ?? emptyChanges(cursor)),
			readContent: () => Promise.reject(new Error('Unexpected content read.')),
			apply: () => Promise.reject(new Error('Unexpected apply.')),
		};
		const result = await runSyncCycle(client, replica, options(state()));
		expect(replica.moves).toEqual([['note.md', 'renamed.md']]);
		expect(replica.deletes).toEqual(['renamed.md']);
		expect(result.objects).toEqual([]);
		expect(result.cursor).toBe('cursor_00000003');
	});
});
