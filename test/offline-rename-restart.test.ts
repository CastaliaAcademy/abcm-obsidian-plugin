import { describe, expect, it } from 'vitest';
import type { ApplyOperation, SyncApi } from '../src/api/sync-client';
import {
  createInitialSyncState,
  hydrateSyncState,
  recordPendingMove,
  runSyncCycle,
  serializeSyncState,
  type LocalReplica,
  type PersistedSyncState,
  type ReplicaEntry,
  type SyncChecksum,
} from '../src/sync';

const digest = (value: string): SyncChecksum => `sha256:${value.repeat(64)}`;
const bytes = (value: string): ArrayBuffer => new TextEncoder().encode(value).buffer;
const checksum = (content: ArrayBuffer): Promise<SyncChecksum> => Promise.resolve(digest(new TextDecoder().decode(content)));

class MemoryReplica implements LocalReplica {
  constructor(private readonly files: Map<string, ArrayBuffer>) {}
  inventory(): Promise<ReplicaEntry[]> {
    return Promise.all([...this.files.entries()].map(async ([path, content]) => ({ objectId: null, path, checksum: await checksum(content), size: content.byteLength, contentType: 'text/markdown' })));
  }
  read(path: string): Promise<ArrayBuffer> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`Missing '${path}'.`);
    return Promise.resolve(content);
  }
  write(path: string, content: ArrayBuffer): Promise<void> { this.files.set(path, content); return Promise.resolve(); }
  delete(path: string): Promise<void> { this.files.delete(path); return Promise.resolve(); }
  move(previousPath: string, path: string): Promise<void> {
    const content = this.files.get(previousPath);
    if (content === undefined) throw new Error(`Missing '${previousPath}'.`);
    this.files.delete(previousPath); this.files.set(path, content); return Promise.resolve();
  }
}

describe('offline rename restart recovery', () => {
  it('persists identity intent and applies an updated rename as one move after restart', async () => {
    const before: PersistedSyncState = {
      ...createInitialSyncState(),
      cursor: 'cursor_base',
      objects: [{ objectId: 'obj_00000001', path: 'note.md', checksum: digest('a') }],
    };
    const recorded = recordPendingMove(before, 'note.md', 'renamed.md');
    const restarted = hydrateSyncState(JSON.parse(serializeSyncState(recorded)));
    expect(restarted.pendingMoves).toEqual([{ objectId: 'obj_00000001', previousPath: 'note.md', path: 'renamed.md' }]);

    const applied: ApplyOperation[] = [];
    let hints: unknown;
    const client: SyncApi = {
      changes: (cursor) => Promise.resolve({ changes: [], nextCursor: cursor, hasMore: false }),
      preview: (...args: Parameters<SyncApi['preview']>) => {
        hints = args[5];
        return Promise.resolve({
          previewId: 'preview_move', serverRevision: 'revision_move', cursor: 'cursor_base',
          items: [{ action: 'move-server', objectId: 'obj_00000001', previousPath: 'note.md', path: 'renamed.md', localChecksum: digest('b'), serverChecksum: digest('a'), size: 1 }],
        });
      },
      readContent: () => Promise.reject(new Error('Unexpected content read.')),
      apply: (_preview, operations) => {
        applied.push(...operations);
        return Promise.resolve({ receipts: [{ status: 'applied', operationId: operations[0]?.operationId ?? '', cursor: 'cursor_moved', objectId: 'obj_00000001', checksum: digest('b') }] });
      },
    };
    const result = await runSyncCycle(client, new MemoryReplica(new Map([['renamed.md', bytes('b')]])), {
      state: restarted,
      deviceId: 'device_00000001',
      include: [], exclude: [],
      operationId: () => 'op_move_restart_01',
      checksum,
      base64: () => 'Yg==',
      persistState: () => undefined,
    });

    expect(hints).toEqual([{ objectId: 'obj_00000001', previousPath: 'note.md', path: 'renamed.md' }]);
    expect(applied).toEqual([expect.objectContaining({ kind: 'move', objectId: 'obj_00000001', previousPath: 'note.md', path: 'renamed.md', baseChecksum: digest('a'), checksum: digest('b') })]);
    expect(result.objects).toEqual([{ objectId: 'obj_00000001', path: 'renamed.md', checksum: digest('b') }]);
    expect(result.pendingMoves).toEqual([]);
  });
});
