import { describe, expect, it } from 'vitest';
import { AbcmSyncClient } from '../src/api/sync-client';
import type { HttpRequest, HttpTransport } from '../src/api/http';

const emptyBuffer = new ArrayBuffer(0);

describe('ABCM sync REST client', () => {
	it('sends the strict portable inventory shape without local object ids', async () => {
		let request: HttpRequest | undefined;
		const transport: HttpTransport = {
			request: (input) => {
				request = input;
				return Promise.resolve({
					status: 200,
					headers: {},
					json: {
						previewId: 'preview_00000001',
						serverRevision: 'revision-1',
						cursor: 'cursor_00000001',
						expiresAt: '2026-08-14T00:00:00.000Z',
						items: [],
					},
					arrayBuffer: emptyBuffer,
				});
			},
		};
		const client = new AbcmSyncClient(
			transport,
			'https://abcm.example',
			'castalia-public',
			'abcm',
			'device-credential',
		);
		await client.preview(null, [{
			objectId: null,
			path: 'a.md',
			checksum: `sha256:${'a'.repeat(64)}`,
			size: 1,
			contentType: 'text/markdown',
		}], [], [], [{
			objectId: 'obj_00000001',
			path: 'a.md',
			checksum: `sha256:${'a'.repeat(64)}`,
		}]);
		const body = JSON.parse(request?.body ?? '{}') as Record<string, unknown>;
		expect(body.inventory).toEqual([{
			path: 'a.md',
			checksum: `sha256:${'a'.repeat(64)}`,
			size: 1,
			contentType: 'text/markdown',
		}]);
		expect(body.base).toEqual([{
			objectId: 'obj_00000001',
			path: 'a.md',
			checksum: `sha256:${'a'.repeat(64)}`,
		}]);
	});

	it('requests a bounded ordered changes page after the opaque cursor', async () => {
		let request: HttpRequest | undefined;
		const transport: HttpTransport = {
			request: (input) => {
				request = input;
				return Promise.resolve({
					status: 200,
					headers: {},
					json: {
						changes: [],
						nextCursor: 'cursor_00000001',
						hasMore: false,
					},
					arrayBuffer: emptyBuffer,
				});
			},
		};
		const client = new AbcmSyncClient(
			transport,
			'https://abcm.example',
			'castalia-public',
			'abcm',
			'device-credential',
		);
		await client.changes('cursor_00000001', 100);
		expect(request).toMatchObject({
			method: 'GET',
			url: 'https://abcm.example/v1/workspaces/castalia-public/projects/abcm/sync/changes?cursor=cursor_00000001&limit=100',
		});
	});
});
