import { describe, expect, it } from 'vitest';
import type { SyncApi } from '../src/api/sync-client';
import {
	createInitialSyncState,
	runSyncCycle,
	type LocalReplica,
	type PersistedSyncState,
	type SyncChecksum,
} from '../src/sync';

const digest: SyncChecksum = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const content = new TextEncoder().encode('a').buffer;

describe('initial synchronization confirmation', () => {
	it('performs no local or server mutation when the pinned preview is declined', async () => {
		const writes: string[] = [];
		const persisted: PersistedSyncState[] = [];
		let applied = false;
		const local: LocalReplica = {
			inventory: () => Promise.resolve([]),
			read: () => Promise.reject(new Error('Unexpected local read.')),
			write: (path) => {
				writes.push(path);
				return Promise.resolve();
			},
			delete: () => Promise.reject(new Error('Unexpected local delete.')),
			move: () => Promise.reject(new Error('Unexpected local move.')),
		};
		const client: SyncApi = {
			preview: () => Promise.resolve({
				previewId: 'preview_00000001',
				serverRevision: 'revision-1',
				cursor: 'cursor_00000001',
				items: [{
					action: 'create-local',
					objectId: 'obj_00000001',
					path: 'remote.md',
					localChecksum: null,
					serverChecksum: digest,
					size: 1,
				}],
			}),
			changes: (cursor) => Promise.resolve({
				changes: [],
				nextCursor: cursor,
				hasMore: false,
			}),
			readContent: () => Promise.resolve(content),
			apply: () => {
				applied = true;
				return Promise.resolve({ receipts: [] });
			},
		};

		await expect(runSyncCycle(client, local, {
			state: createInitialSyncState(),
			deviceId: 'device_00000001',
			include: [],
			exclude: [],
			operationId: () => 'op_00000001',
			checksum: () => Promise.resolve(digest),
			base64: () => 'YQ==',
			confirmInitialPreview: () => Promise.resolve(false),
			persistState: (state) => {
				persisted.push(structuredClone(state));
			},
		})).rejects.toThrow('not confirmed');
		expect(writes).toEqual([]);
		expect(applied).toBe(false);
		expect(persisted).toEqual([]);
	});
});
