import type { HttpTransport } from './http';
import type { BaseEntry, ConflictSide, ReplicaEntry, SyncChecksum } from '../sync';

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
	expiresAt?: string;
	items: PreviewItem[];
}

interface ApplyOperationBase {
	operationId: string;
	objectId: string;
	path: string;
}

export type ApplyOperation =
	| (ApplyOperationBase & {
		kind: 'create' | 'update';
		checksum: SyncChecksum;
		baseChecksum?: SyncChecksum;
		contentBase64: string;
		contentType: string;
		size: number;
	})
	| (ApplyOperationBase & {
		kind: 'delete';
		baseChecksum: SyncChecksum;
	})
	| (ApplyOperationBase & {
		kind: 'move';
		previousPath: string;
		checksum: SyncChecksum;
		baseChecksum: SyncChecksum;
		contentBase64: string;
		contentType: string;
		size: number;
	});

export interface ApplyReceipt {
	operationId: string;
	cursor: string;
	objectId: string;
	checksum: SyncChecksum | null;
	status: 'applied' | 'duplicate' | 'conflict';
	conflictId?: string;
}

export interface ApplyResult {
	receipts: ApplyReceipt[];
}

export type ConflictResolution = 'keep-local' | 'keep-server' | 'keep-both';

export interface SyncConflict {
	conflictId: string;
	objectId: string;
	kind: 'concurrent-update' | 'delete-update' | 'move-move' | 'portable-path';
	path: string;
	localPath: string | null;
	serverPath: string | null;
	local: ConflictSide;
	server: ConflictSide;
	baseChecksum: SyncChecksum | null;
	status: 'open' | 'resolved';
}

interface ChangeBase {
	cursor: string;
	objectId: string;
	operationId: string;
	originDeviceId: string | null;
	path: string;
	occurredAt: string;
}

interface ContentChange {
	checksum: SyncChecksum;
	size: number;
	contentType: string;
	tombstone: false;
}

export type SyncChange =
	| (ChangeBase & ContentChange & { kind: 'create' })
	| (ChangeBase & ContentChange & {
			kind: 'update';
			baseChecksum: SyncChecksum;
	  })
	| (ChangeBase & {
			kind: 'delete';
			baseChecksum: SyncChecksum;
			tombstone: true;
	  })
	| (ChangeBase & ContentChange & {
			kind: 'move';
			previousPath: string;
			baseChecksum: SyncChecksum;
	  });

export interface ChangesResult {
	changes: SyncChange[];
	nextCursor: string;
	hasMore: boolean;
}

export class AbcmSyncHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string | null,
	) {
		super(message);
		this.name = 'AbcmSyncHttpError';
	}
}

function responseCode(value: unknown): string | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const code = (value as Record<string, unknown>).code;
	return typeof code === 'string' ? code : null;
}

function assertStatus(status: number, expected: number, body: unknown, operation: string): void {
	if (status === expected) return;
	throw new AbcmSyncHttpError(
		`ABCM ${operation} failed with HTTP ${status}.`,
		status,
		responseCode(body),
	);
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('ABCM sync response is invalid.');
	}
	return value as Record<string, unknown>;
}

export interface SyncApi {
	preview(
		cursor: string | null,
		inventory: ReplicaEntry[],
		include: string[],
		exclude: string[],
		base?: BaseEntry[],
	): Promise<PreviewResult>;
	changes(cursor: string, limit: number): Promise<ChangesResult>;
	readContent(path: string): Promise<ArrayBuffer>;
	getConflict?(conflictId: string): Promise<SyncConflict>;
	resolveConflict?(conflictId: string, input: { operationId: string; resolution: ConflictResolution; localChecksum: SyncChecksum | null; serverChecksum: SyncChecksum | null; keepBothPath?: string }): Promise<ApplyReceipt>;
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
		base?: BaseEntry[],
	): Promise<PreviewResult> {
		const response = await this.transport.request({
			url: `${this.base()}/preview`,
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({
				cursor,
				inventory: inventory.map(({ path, checksum, size, contentType }) => ({
					path,
					checksum,
					size,
					...(contentType === undefined ? {} : { contentType }),
				})),
				include,
				exclude,
				...(base === undefined ? {} : { base }),
			}),
		});
		assertStatus(response.status, 200, response.json, 'preview');
		const value = record(response.json);
		if (
			typeof value.previewId !== 'string' ||
			typeof value.serverRevision !== 'string' ||
			typeof value.cursor !== 'string' ||
			!Array.isArray(value.items)
		) {
			throw new Error('ABCM preview response is invalid.');
		}
		return value as unknown as PreviewResult;
	}

	async changes(cursor: string, limit: number): Promise<ChangesResult> {
		const response = await this.transport.request({
			url: `${this.base()}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,
			method: 'GET',
			headers: { authorization: `Bearer ${this.credential}` },
		});
		assertStatus(response.status, 200, response.json, 'changes read');
		const value = record(response.json);
		if (
			!Array.isArray(value.changes) ||
			typeof value.nextCursor !== 'string' ||
			typeof value.hasMore !== 'boolean'
		) {
			throw new Error('ABCM changes response is invalid.');
		}
		return value as unknown as ChangesResult;
	}

	async readContent(path: string): Promise<ArrayBuffer> {
		const response = await this.transport.request({
			url: `${this.base()}/content?path=${encodeURIComponent(path)}`,
			method: 'GET',
			headers: { authorization: `Bearer ${this.credential}` },
		});
		assertStatus(response.status, 200, response.json, 'content read');
		return response.arrayBuffer;
	}

	async getConflict(conflictId: string): Promise<SyncConflict> {
		const response = await this.transport.request({
			url: this.base() + '/conflicts/' + encodeURIComponent(conflictId),
			method: 'GET',
			headers: { authorization: 'Bearer ' + this.credential },
		});
		assertStatus(response.status, 200, response.json, 'conflict read');
		return record(response.json) as unknown as SyncConflict;
	}

	async resolveConflict(
		conflictId: string,
		input: { operationId: string; resolution: ConflictResolution; localChecksum: SyncChecksum | null; serverChecksum: SyncChecksum | null; keepBothPath?: string },
	): Promise<ApplyReceipt> {
		const response = await this.transport.request({
			url: this.base() + '/conflicts/' + encodeURIComponent(conflictId) + '/resolve',
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify(input),
		});
		assertStatus(response.status, 200, response.json, 'conflict resolution');
		return record(response.json) as unknown as ApplyReceipt;
	}

	async apply(
		preview: PreviewResult,
		operations: ApplyOperation[],
	): Promise<ApplyResult> {
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
		assertStatus(response.status, 200, response.json, 'apply');
		const value = record(response.json);
		if (!Array.isArray(value.receipts)) {
			throw new Error('ABCM apply response is invalid.');
		}
		return value as unknown as ApplyResult;
	}
}
