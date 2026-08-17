import { normalizePath, TFile, type FileManager, type Vault } from 'obsidian';
import type { LocalReplica } from '../sync/sync-cycle';
import type { ReplicaEntry, SyncChecksum } from '../sync';

const CONFLICT_ROOT = '_ABCM Conflicts';

async function checksum(content: ArrayBuffer): Promise<SyncChecksum> {
	const digest = await crypto.subtle.digest('SHA-256', content);
	return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export class ObsidianVaultReplica implements LocalReplica {
	constructor(
		private readonly vault: Vault,
		private readonly fileManager: FileManager,
		private readonly folder: string,
	) {}

	private relative(file: TFile): string | null {
		if (this.folder === '') return file.path;
		const prefix = `${this.folder}/`;
		return file.path.startsWith(prefix) ? file.path.slice(prefix.length) : null;
	}

	private async ensureParent(absolute: string): Promise<void> {
		const segments = absolute.split('/');
		segments.pop();
		let current = '';
		for (const segment of segments) {
			current = current === '' ? segment : `${current}/${segment}`;
			if (this.vault.getAbstractFileByPath(current) === null) {
				await this.vault.createFolder(current);
			}
		}
	}

	private absolute(path: string): string {
		return normalizePath(this.folder === '' ? path : `${this.folder}/${path}`);
	}

	async inventory(): Promise<ReplicaEntry[]> {
		const entries: ReplicaEntry[] = [];
		for (const file of this.vault.getFiles()) {
			const path = this.relative(file);
			if (path === null || path === CONFLICT_ROOT || path.startsWith(`${CONFLICT_ROOT}/`)) continue;
			const content = await this.vault.readBinary(file);
			entries.push({
				objectId: null,
				path,
				checksum: await checksum(content),
				size: content.byteLength,
				contentType: 'application/octet-stream',
			});
		}
		return entries.sort((left, right) => left.path.localeCompare(right.path));
	}

	async read(path: string): Promise<ArrayBuffer> {
		const file = this.vault.getFileByPath(this.absolute(path));
		if (file === null) throw new Error(`Vault file '${path}' does not exist.`);
		return this.vault.readBinary(file);
	}

	async write(path: string, content: ArrayBuffer): Promise<void> {
		const absolute = this.absolute(path);
		await this.ensureParent(absolute);
		const existing = this.vault.getAbstractFileByPath(absolute);
		if (existing instanceof TFile) await this.vault.modifyBinary(existing, content);
		else if (existing === null) await this.vault.createBinary(absolute, content);
		else throw new Error(`Vault path '${path}' is not a file.`);
	}

	async delete(path: string): Promise<void> {
		const file = this.vault.getFileByPath(this.absolute(path));
		if (file === null) throw new Error(`Vault file '${path}' does not exist.`);
		await this.fileManager.trashFile(file);
	}

	async move(previousPath: string, path: string): Promise<void> {
		const source = this.vault.getFileByPath(this.absolute(previousPath));
		if (source === null) throw new Error(`Vault file '${previousPath}' does not exist.`);
		const target = this.absolute(path);
		if (this.vault.getAbstractFileByPath(target) !== null) {
			throw new Error(`Vault path '${path}' already exists.`);
		}
		await this.ensureParent(target);
		await this.vault.rename(source, target);
	}
}
