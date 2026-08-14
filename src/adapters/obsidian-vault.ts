import { normalizePath, TFile, type Vault } from 'obsidian';
import type { LocalReplica } from '../sync/sync-cycle';
import type { ReplicaEntry, SyncChecksum } from '../sync';

async function checksum(content: ArrayBuffer): Promise<SyncChecksum> {
	const digest = await crypto.subtle.digest('SHA-256', content);
	return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export class ObsidianVaultReplica implements LocalReplica {
	constructor(
		private readonly vault: Vault,
		private readonly folder: string,
	) {}

	private relative(file: TFile): string | null {
		if (this.folder === '') return file.path;
		const prefix = `${this.folder}/`;
		return file.path.startsWith(prefix) ? file.path.slice(prefix.length) : null;
	}

	private absolute(path: string): string {
		return normalizePath(this.folder === '' ? path : `${this.folder}/${path}`);
	}

	async inventory(): Promise<ReplicaEntry[]> {
		const entries: ReplicaEntry[] = [];
		for (const file of this.vault.getFiles()) {
			const path = this.relative(file);
			if (path === null) continue;
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
		const segments = absolute.split('/');
		segments.pop();
		let current = '';
		for (const segment of segments) {
			current = current === '' ? segment : `${current}/${segment}`;
			if (this.vault.getAbstractFileByPath(current) === null) {
				await this.vault.createFolder(current);
			}
		}
		const existing = this.vault.getAbstractFileByPath(absolute);
		if (existing instanceof TFile) await this.vault.modifyBinary(existing, content);
		else if (existing === null) await this.vault.createBinary(absolute, content);
		else throw new Error(`Vault path '${path}' is not a file.`);
	}
}
