import type { ApplyOperation, PreviewItem, SyncApi } from '../api/sync-client';
import type { ReplicaEntry, SyncChecksum } from './types';

export interface LocalReplica {
	inventory(): Promise<ReplicaEntry[]>;
	read(path: string): Promise<ArrayBuffer>;
	write(path: string, content: ArrayBuffer): Promise<void>;
}

export interface SyncCycleOptions {
	cursor: string | null;
	include: string[];
	exclude: string[];
	operationId(): string;
	checksum(content: ArrayBuffer): Promise<SyncChecksum>;
	base64(content: ArrayBuffer): string;
}

function requiresManualResolution(item: PreviewItem): boolean {
	return [
		'delete-local',
		'delete-server',
		'move-local',
		'move-server',
		'conflict',
	].includes(item.action);
}

export async function runSyncCycle(
	client: SyncApi,
	local: LocalReplica,
	options: SyncCycleOptions,
): Promise<string> {
	const inventory = await local.inventory();
	const preview = await client.preview(
		options.cursor,
		inventory,
		options.include,
		options.exclude,
	);
	const blocked = preview.items.find(requiresManualResolution);
	if (blocked !== undefined) {
		throw new Error(`Sync requires manual resolution for '${blocked.path}'.`);
	}

	const byPath = new Map(inventory.map((entry) => [entry.path, entry]));
	const operations: ApplyOperation[] = [];
	for (const item of preview.items) {
		if (item.action !== 'create-server' && item.action !== 'update-server') continue;
		const entry = byPath.get(item.path);
		if (entry === undefined || item.objectId === null) {
			throw new Error(`Pinned preview differs from local inventory at '${item.path}'.`);
		}
		const content = await local.read(item.path);
		if ((await options.checksum(content)) !== entry.checksum) {
			throw new Error(`Local file changed after preview at '${item.path}'.`);
		}
		operations.push({
			operationId: options.operationId(),
			objectId: item.objectId,
			path: item.path,
			kind: item.action === 'create-server' ? 'create' : 'update',
			checksum: entry.checksum,
			...(item.action === 'update-server' && item.serverChecksum !== null
				? { baseChecksum: item.serverChecksum }
				: {}),
			contentBase64: options.base64(content),
			contentType: entry.contentType ?? 'application/octet-stream',
			size: content.byteLength,
		});
	}
	let cursor = preview.cursor;
	if (operations.length > 0) {
		const result = await client.apply(preview, operations);
		cursor = result.receipts.at(-1)?.cursor ?? cursor;
	}
	for (const item of preview.items) {
		if (item.action === 'create-local' || item.action === 'update-local') {
			await local.write(item.path, await client.readContent(item.path));
		}
	}
	return cursor;
}
