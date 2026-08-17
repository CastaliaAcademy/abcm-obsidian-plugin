import { describe, expect, it } from 'vitest';
import {
	createInitialSyncState,
	hydrateSyncState,
	serializeSyncState,
	type PersistedSyncState,
	type SyncChecksum,
} from '../src/sync';

const checksum = (character: string): SyncChecksum =>
	`sha256:${character.repeat(64)}`;

describe('durable delete and move outbox', () => {
	it('round-trips restart-safe action metadata without document bodies', () => {
		const state: PersistedSyncState = {
			...createInitialSyncState(),
			cursor: 'cursor_00000001',
			objects: [
				{ objectId: 'obj_00000001', path: 'delete.md', checksum: checksum('a') },
				{ objectId: 'obj_00000002', path: 'before.md', checksum: checksum('b') },
			],
			outbox: [{
				operationId: 'op_delete_00000001',
				objectId: 'obj_00000001',
				path: 'delete.md',
				kind: 'delete',
				checksum: null,
				baseChecksum: checksum('a'),
				size: null,
				contentType: null,
				previewId: 'preview_00000001',
				serverRevision: 'revision-1',
				previewCursor: 'cursor_00000001',
			}, {
				operationId: 'op_move_0000000001',
				objectId: 'obj_00000002',
				path: 'after.md',
				kind: 'move',
				checksum: checksum('b'),
				baseChecksum: checksum('b'),
				size: 1,
				contentType: 'text/markdown',
				previousPath: 'before.md',
				previewId: 'preview_00000001',
				serverRevision: 'revision-1',
				previewCursor: 'cursor_00000001',
			}],
		};

		const serialized = serializeSyncState(state);
		expect(serialized).not.toContain('contentBase64');
		expect(hydrateSyncState(JSON.parse(serialized))).toEqual(state);
	});
});
