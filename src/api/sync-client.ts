import type { HttpTransport } from './http';
import type { ReplicaEntry, SyncChecksum } from '../sync';

export type PreviewAction =
	| 'create-local'
	| 'create-server'
	| 'update-local'
	| 'update-server'
	| 'delete-local'
	| 'delete-server'
	| 'move-local'
	| 'move-server'
	| 'conflict'
	| 'noop';

export interface PreviewItem {
	action: PreviewAction;
	objectId: string | null;
	path: string;
	previousPath?: string;
	localChecksum: SyncChecksum | null;
	serverChecksum: SyncChecksum | null;
	size: number | null;
}

export interface PreviewResult {
	previewId: string;
	serverRevision: string;
	cursor: string;
	items: PreviewItem[];
}

export interface ApplyOperation {
	operationId: string;
	objectId: string;
	path: string;
	kind: 'create' | 'update';
	checksum: SyncChecksum;
	baseChecksum?: SyncChecksum;
	contentBase64: string;
	contentType: string;
	size: number;
}

export interface ApplyResult {
	receipts: Array<{ status: string; cursor: string }>;
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('ABCM sync response is invalid.');
	}
	return value as Record<string, unknown>;
}

export interface SyncApi {
	preview(cursor: string | null, inventory: ReplicaEntry[], include: string[], exclude: string[]): Promise<PreviewResult>;
	readContent(path: string): Promise<ArrayBuffer>;
	apply(preview: PreviewResult, operations: ApplyOperation[]): Promise<ApplyResult>;
}

export class AbcmSyncClient implements SyncApi {
	constructor(
		private readonly transport: HttpTransport,
		private readonly endpoint: string,
		private readonly workspaceId: string,
		private readonly projectId: string,
		private readonly credential: string,
	) {}

	private base(): string {
		return `${this.endpoint}/v1/workspaces/${encodeURIComponent(this.workspaceId)}/projects/${encodeURIComponent(this.projectId)}/sync`;
	}

	private headers(): Record<string, string> {
		return {
			authorization: `Bearer ${this.credential}`,
			'content-type': 'application/json',
		};
	}

	async preview(
		cursor: string | null,
		inventory: ReplicaEntry[],
		include: string[],
		exclude: string[],
	): Promise<PreviewResult> {
		const response = await this.transport.request({
			url: `${this.base()}/preview`,
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ cursor, inventory, include, exclude }),
		});
		if (response.status !== 200) throw new Error(`ABCM preview failed with HTTP ${response.status}.`);
		const value = record(response.json);
		if (
			typeof value.previewId !== 'string' ||
			typeof value.serverRevision !== 'string' ||
			typeof value.cursor !== 'string' ||
			!Array.isArray(value.items)
		) throw new Error('ABCM preview response is invalid.');
		return value as unknown as PreviewResult;
	}

	async readContent(path: string): Promise<ArrayBuffer> {
		const response = await this.transport.request({
			url: `${this.base()}/content?path=${encodeURIComponent(path)}`,
			method: 'GET',
			headers: { authorization: `Bearer ${this.credential}` },
		});
		if (response.status !== 200) throw new Error(`ABCM content read failed with HTTP ${response.status}.`);
		return response.arrayBuffer;
	}

	async apply(preview: PreviewResult, operations: ApplyOperation[]): Promise<ApplyResult> {
		const response = await this.transport.request({
			url: `${this.base()}/apply`,
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({
				cursor: preview.cursor,
				previewId: preview.previewId,
				serverRevision: preview.serverRevision,
				operations,
			}),
		});
		if (response.status !== 200) throw new Error(`ABCM apply failed with HTTP ${response.status}.`);
		const value = record(response.json);
		if (!Array.isArray(value.receipts)) throw new Error('ABCM apply response is invalid.');
		return value as unknown as ApplyResult;
	}
}
