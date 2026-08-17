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
}

describe('expired cursor recovery', () => {
	it('keeps the durable outbox until a replacement preview captures the same local bytes', async () => {
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
				expect(base).toEqual(state.objects);
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

		expect(persisted.some((snapshot) => snapshot.cursor === null && snapshot.outbox[0]?.operationId === oldOperationId)).toBe(true);
		expect(applied[0]).toMatchObject({ operationId: 'op_fresh000001', kind: 'update', checksum: digest('b') });
		expect(confirmCalls).toBe(0);
		expect(result).toMatchObject({ cursor: 'cursor_applied', outbox: [] });
	});
});
