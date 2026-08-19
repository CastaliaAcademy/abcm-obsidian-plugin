import { describe, expect, it } from 'vitest';

import type { ApplyOperation, SyncApi } from '../src/api/sync-client';
import {
	createInitialSyncState,
	resolvePersistedConflict,
	runSyncCycle,
	type LocalReplica,
	type PersistedSyncState,
	type ReplicaEntry,
	type SyncChecksum,
} from '../src/sync';

const bytes = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const text = (value: ArrayBuffer): string => new TextDecoder().decode(value);
const digest = (value: string): SyncChecksum => {
	let hash = 2_166_136_261;
	for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
	return `sha256:${hash.toString(16).padStart(8, '0').repeat(8)}`;
};
const checksum = (value: ArrayBuffer): Promise<SyncChecksum> => Promise.resolve(digest(new TextDecoder().decode(value)));

class ConflictReplica implements LocalReplica {
	readonly files: Map<string, ArrayBuffer>;
	readonly artifacts = new Map<string, ArrayBuffer>();

	constructor(files: Map<string, ArrayBuffer>) {
		this.files = files;
	}

	async inventory(): Promise<ReplicaEntry[]> {
		return Promise.all([...this.files].map(async ([path, content]) => ({
			objectId: null,
			path,
			checksum: await checksum(content),
			size: content.byteLength,
			contentType: 'text/markdown',
		})));
	}

	read(path: string): Promise<ArrayBuffer> {
		const content = this.files.get(path);
		if (content === undefined) return Promise.reject(new Error('Missing local file: ' + path));
		return Promise.resolve(content);
	}

	write(path: string, content: ArrayBuffer): Promise<void> {
		this.files.set(path, content.slice(0));
		return Promise.resolve();
	}

	delete(path: string): Promise<void> {
		this.files.delete(path);
		return Promise.resolve();
	}

	move(previousPath: string, path: string): Promise<void> {
		const content = this.files.get(previousPath);
		if (content === undefined) return Promise.reject(new Error('Missing move source.'));
		this.files.delete(previousPath);
		this.files.set(path, content);
		return Promise.resolve();
	}

	writeConflictArtifact(conflictId: string, sourcePath: string, content: ArrayBuffer): Promise<string> {
		const path = '_ABCM Conflicts/' + conflictId + '/server-' + sourcePath.split('/').at(-1);
		this.artifacts.set(path, content.slice(0));
		return Promise.resolve(path);
	}
}

describe('conflict-safe synchronization cycle', () => {
	it('preserves both versions, pauses one object, and applies unrelated operations', async () => {
		const replica = new ConflictReplica(new Map([
			['note.md', bytes('local-v2')],
			['other.md', bytes('other-v2')],
		]));
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_00000001',
			objects: [
				{ objectId: 'obj_note_00000001', path: 'note.md', checksum: digest('base') },
				{ objectId: 'obj_other_0000001', path: 'other.md', checksum: digest('other-v1') },
			],
		};
		const applied: ApplyOperation[] = [];
		const client: SyncApi = {
			preview: () => Promise.resolve({
				previewId: 'preview_00000001', serverRevision: 'revision-1', cursor: 'cursor_00000001',
				items: [
					{ action: 'conflict', objectId: 'obj_note_00000001', path: 'note.md', localChecksum: digest('local-v2'), serverChecksum: digest('server-v2'), size: 8 },
					{ action: 'update-server', objectId: 'obj_other_0000001', path: 'other.md', localChecksum: digest('other-v2'), serverChecksum: digest('other-v1'), size: 8 },
				],
			}),
			changes: (cursor) => Promise.resolve({ changes: [], nextCursor: cursor, hasMore: false }),
			readContent: (path) => Promise.resolve(path === 'note.md' ? bytes('server-v2') : bytes('other-v2')),
			getConflict: () => Promise.resolve({
				conflictId: 'conflict_00000001', objectId: 'obj_note_00000001', kind: 'concurrent-update', path: 'note.md',
				localPath: 'note.md', serverPath: 'note.md',
				local: { state: 'present', checksum: digest('local-v2'), size: 8, contentType: 'text/markdown' },
				server: { state: 'present', checksum: digest('server-v2'), size: 9, contentType: 'text/markdown' },
				baseChecksum: digest('base'), status: 'open',
			}),
			apply: (_preview, operations) => {
				applied.push(...operations);
				return Promise.resolve({ receipts: operations.map((operation, index) => index === 0 ? {
					operationId: operation.operationId, cursor: 'cursor_00000001', objectId: operation.objectId,
					checksum: null, status: 'conflict' as const, conflictId: 'conflict_00000001',
				} : {
					operationId: operation.operationId, cursor: 'cursor_00000002', objectId: operation.objectId,
					checksum: digest('other-v2'), status: 'applied' as const,
				}) });
			},
		};
		let sequence = 0;
		const result = await runSyncCycle(client, replica, {
			state, deviceId: 'device_00000001', include: [], exclude: [],
			operationId: () => 'op_0000000' + (++sequence), checksum,
			base64: () => 'dGVzdA==',
			persistState: () => undefined,
		});
		expect(applied.map((operation) => operation.kind)).toEqual(['update', 'update']);
		expect(text(await replica.read('note.md'))).toBe('local-v2');
		expect([...replica.artifacts.values()].map(text)).toEqual(['server-v2']);
		expect(result.conflicts).toHaveLength(1);
		expect(result.conflicts[0]?.objectId).toBe('obj_note_00000001');
		expect(result.conflicts[0]?.artifactPath).toContain('_ABCM Conflicts/');
		expect(result.objects).toContainEqual({ objectId: 'obj_other_0000001', path: 'other.md', checksum: digest('other-v2') });
	});

	it('resolves keep-both locally and retains server identity plus the new local object', async () => {
		const replica = new ConflictReplica(new Map([['note.md', bytes('local-v2')]]));
		const state: PersistedSyncState = {
			...createInitialSyncState(), cursor: 'cursor_00000001',
			objects: [{ objectId: 'obj_note_00000001', path: 'note.md', checksum: digest('base') }],
			conflicts: [{
				conflictId: 'conflict_00000001', objectId: 'obj_note_00000001', kind: 'concurrent-update', path: 'note.md',
				localPath: 'note.md', serverPath: 'note.md',
				local: { state: 'present', checksum: digest('local-v2'), size: 8, contentType: 'text/markdown' },
				server: { state: 'present', checksum: digest('server-v2'), size: 9, contentType: 'text/markdown' },
				baseChecksum: digest('base'), artifactPath: '_ABCM Conflicts/conflict_00000001/server-note.md',
			}],
			pendingMoves: [{
				objectId: 'obj_note_00000001',
				previousPath: 'note-base.md',
				path: 'note.md',
			}],
		};
		const client: SyncApi = {
			preview: () => Promise.reject(new Error('Unexpected preview.')),
			changes: () => Promise.reject(new Error('Unexpected changes.')),
			readContent: () => Promise.resolve(bytes('server-v2')),
			apply: () => Promise.reject(new Error('Unexpected apply.')),
			resolveConflict: (_id, input) => Promise.resolve({
				operationId: input.operationId, cursor: 'cursor_00000002', objectId: 'obj_copy_00000001',
				checksum: digest('local-v2'), status: 'applied',
			}),
		};
		await resolvePersistedConflict(client, replica, state, 'conflict_00000001', 'keep-both', 'note-local.md', {
			operationId: () => 'op_resolve_00000001', checksum, persistState: () => undefined,
		});
		expect(text(await replica.read('note.md'))).toBe('server-v2');
		expect(text(await replica.read('note-local.md'))).toBe('local-v2');
		expect(state.conflicts).toEqual([]);
		expect(state.pendingMoves).toEqual([]);
		expect(state.objects).toEqual(expect.arrayContaining([
			{ objectId: 'obj_note_00000001', path: 'note.md', checksum: digest('server-v2') },
			{ objectId: 'obj_copy_00000001', path: 'note-local.md', checksum: digest('local-v2') },
		]));
	});
});
