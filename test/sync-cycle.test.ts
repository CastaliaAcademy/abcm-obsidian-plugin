import { describe, expect, it } from 'vitest';
import type {
	ApplyOperation,
	PreviewResult,
	SyncApi,
} from '../src/api/sync-client';
import { runSyncCycle, type LocalReplica } from '../src/sync/sync-cycle';
import type { ReplicaEntry, SyncChecksum } from '../src/sync';

const digest = (value: string): SyncChecksum =>
	`sha256:${value.repeat(64)}`;
const bytes = new TextEncoder().encode('x').buffer;

function local(entries: ReplicaEntry[]): LocalReplica & { writes: string[] } {
	const writes: string[] = [];
	return {
		writes,
		inventory: () => Promise.resolve(entries),
		read: () => Promise.resolve(bytes),
		write: (path) => {
			writes.push(path);
			return Promise.resolve();
		},
	};
}

function api(
	preview: PreviewResult,
	operations: ApplyOperation[],
): SyncApi {
	return {
		preview: () => Promise.resolve(preview),
		readContent: () => Promise.resolve(bytes),
		apply: (_preview, applied) => {
			operations.push(...applied);
			return Promise.resolve({
				receipts: [{ status: 'applied', cursor: 'cursor_00000002' }],
			});
		},
	};
}

const options = {
	cursor: null,
	include: [] as string[],
	exclude: [] as string[],
	operationId: () => 'op_00000001',
	checksum: () => Promise.resolve(digest('a')),
	base64: () => 'eA==',
};

describe('one foreground synchronization cycle', () => {
	it('pushes a pinned local create and commits the receipt cursor', async () => {
		const operations: ApplyOperation[] = [];
		const replica = local([
			{ objectId: null, path: 'a.md', checksum: digest('a'), size: 1 },
		]);
		const cursor = await runSyncCycle(
			api(
				{
					previewId: 'preview_00000001',
					serverRevision: 'revision-1',
					cursor: 'cursor_00000001',
					items: [{
						action: 'create-server',
						objectId: 'obj_00000001',
						path: 'a.md',
						localChecksum: digest('a'),
						serverChecksum: null,
						size: 1,
					}],
				},
				operations,
			),
			replica,
			options,
		);
		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({ kind: 'create', path: 'a.md' });
		expect(cursor).toBe('cursor_00000002');
	});

	it('pulls exact remote bytes before committing the preview cursor', async () => {
		const replica = local([]);
		const cursor = await runSyncCycle(
			api({
				previewId: 'preview_00000001',
				serverRevision: 'revision-1',
				cursor: 'cursor_00000001',
				items: [{
					action: 'create-local',
					objectId: 'obj_00000001',
					path: 'remote.md',
					localChecksum: null,
					serverChecksum: digest('b'),
					size: 1,
				}],
			}, []),
			replica,
			options,
		);
		expect(replica.writes).toEqual(['remote.md']);
		expect(cursor).toBe('cursor_00000001');
	});
});
