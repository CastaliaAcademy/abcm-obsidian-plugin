import { describe, expect, it } from 'vitest';
import {
	createInitialSyncState,
	hydrateSyncState,
	planReplicaObject,
	serializeSyncState,
	shouldSuppressEcho,
	type BaseEntry,
	type ReplicaEntry,
	type SyncChecksum,
} from '../src/sync';

const checksum = (character: string): SyncChecksum =>
	`sha256:${character.repeat(64)}`;
const base: BaseEntry = {
	objectId: 'obj_00000001',
	path: 'notes/a.md',
	checksum: checksum('a'),
};
const replica = (
	path: string,
	digest: string,
	objectId: string | null = base.objectId,
): ReplicaEntry => ({ objectId, path, checksum: checksum(digest), size: 1 });

describe('platform-neutral synchronization core', () => {
	it('plans no-op, local-only, and remote-only states', () => {
		expect(
			planReplicaObject({
				base,
				local: replica(base.path, 'a'),
				server: replica(base.path, 'a'),
			}),
		).toEqual({ action: 'noop', objectId: base.objectId, path: base.path });
		expect(
			planReplicaObject({
				base: null,
				local: replica('notes/local.md', 'b', null),
				server: null,
			}),
		).toMatchObject({ action: 'push', kind: 'create' });
		expect(
			planReplicaObject({
				base: null,
				local: null,
				server: replica('notes/remote.md', 'c', 'obj_00000002'),
			}),
		).toMatchObject({ action: 'pull', kind: 'create' });
	});

	it('detects concurrent update, delete/update, and move/move conflicts', () => {
		expect(
			planReplicaObject({
				base,
				local: replica(base.path, 'b'),
				server: replica(base.path, 'c'),
			}),
		).toMatchObject({ action: 'conflict', kind: 'concurrent-update' });
		expect(
			planReplicaObject({
				base,
				local: null,
				server: replica(base.path, 'b'),
			}),
		).toMatchObject({ action: 'conflict', kind: 'delete-update' });
		expect(
			planReplicaObject({
				base,
				local: replica('notes/local.md', 'a'),
				server: replica('notes/remote.md', 'a'),
			}),
		).toMatchObject({ action: 'conflict', kind: 'move-move' });
	});

	it('suppresses only a confirmed echo from this device and operation', () => {
		const pending = new Set(['op_00000001']);
		expect(
			shouldSuppressEcho(
				{ originDeviceId: 'device_00000001', operationId: 'op_00000001' },
				'device_00000001',
				pending,
			),
		).toBe(true);
		expect(
			shouldSuppressEcho(
				{ originDeviceId: 'device_00000002', operationId: 'op_00000001' },
				'device_00000001',
				pending,
			),
		).toBe(false);
	});

	it('round-trips pinned outbox metadata without document bodies', () => {
		const state = {
			...createInitialSyncState(),
			cursor: 'cursor_00000001',
			objects: [base],
			outbox: [{
				operationId: 'op_00000001',
				objectId: base.objectId,
				path: base.path,
				kind: 'update' as const,
				checksum: checksum('b'),
				baseChecksum: base.checksum,
				size: 1,
				contentType: 'text/markdown',
				previewId: 'preview_00000001',
				serverRevision: 'revision-1',
				previewCursor: 'cursor_00000001',
				receipt: {
					operationId: 'op_00000001',
					cursor: 'cursor_00000002',
					objectId: base.objectId,
					checksum: checksum('c'),
					status: 'applied' as const,
				},
			}],
			recentOperationIds: ['op_00000000'],
		};
		const serialized = serializeSyncState(state);
		expect(serialized).not.toContain('contentBase64');
		expect(hydrateSyncState(JSON.parse(serialized))).toEqual(state);
	});

	it('migrates an empty version-one state and rejects an unsafe legacy outbox', () => {
		expect(hydrateSyncState({
			schemaVersion: 1,
			cursor: null,
			objects: [],
			outbox: [],
		})).toEqual(createInitialSyncState());
		expect(() => hydrateSyncState({
			schemaVersion: 1,
			cursor: null,
			objects: [],
			outbox: [{ operationId: 'legacy' }],
		})).toThrow('Legacy pending outbox');
	});
});
