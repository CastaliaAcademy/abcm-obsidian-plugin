import { Modal, Notice, Setting, normalizePath, TFile, type App } from 'obsidian';
import type { ConflictResolution } from '../api/sync-client';
import type { PersistedConflictState } from '../sync';
import { lineDiff } from './line-diff';

const MAX_DIFF_BYTES = 64 * 1024;

function isText(contentType: string): boolean {
	return contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('yaml');
}

export type ConflictResolver = (
	conflictId: string,
	resolution: ConflictResolution,
	keepBothPath?: string,
) => Promise<void>;

export class ConflictModal extends Modal {
	constructor(
		app: App,
		private readonly conflicts: PersistedConflictState[],
		private readonly vaultFolder: string,
		private readonly resolveConflict: ConflictResolver,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('ABCM sync conflicts');
		void this.render();
	}

	private absolute(path: string): string {
		return normalizePath(this.vaultFolder === '' ? path : this.vaultFolder + '/' + path);
	}

	private async read(path: string): Promise<ArrayBuffer | null> {
		const file = this.app.vault.getFileByPath(this.absolute(path));
		return file instanceof TFile ? this.app.vault.readBinary(file) : null;
	}

	private defaultKeepBothPath(conflict: PersistedConflictState): string {
		const source = conflict.localPath ?? conflict.serverPath ?? conflict.path;
		const segments = source.split('/');
		const filename = segments.pop() ?? 'recovered.bin';
		return [...segments, 'Recovered ' + filename].join('/');
	}

	private async render(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl('p', { text: 'Choose an explicit resolution. Unrelated files continue synchronizing.' });
		for (const conflict of this.conflicts) {
			const section = this.contentEl.createDiv({ cls: 'abcm-conflict' });
			section.createEl('h3', { text: conflict.path });
			section.createEl('p', { text: conflict.kind + ' · server artifact: ' + conflict.artifactPath });
			await this.renderComparison(section, conflict);
			let keepBothPath = this.defaultKeepBothPath(conflict);
			new Setting(section)
				.setName('Keep both path')
				.setDesc('Portable destination for the recovered local version.')
				.addText((component) => component.setValue(keepBothPath).onChange((value) => { keepBothPath = value.trim(); }));
			const actions = new Setting(section);
			actions.addButton((button) => button.setButtonText('Keep local').onClick(() => void this.resolve(conflict, 'keep-local')));
			actions.addButton((button) => button.setButtonText('Keep server').onClick(() => void this.resolve(conflict, 'keep-server')));
			actions.addButton((button) => button.setCta().setButtonText('Keep both').onClick(() => void this.resolve(conflict, 'keep-both', keepBothPath)));
		}
	}

	private async renderComparison(section: HTMLElement, conflict: PersistedConflictState): Promise<void> {
		if (conflict.local.state === 'present' && conflict.server.state === 'present' &&
			isText(conflict.local.contentType) && isText(conflict.server.contentType) &&
			conflict.local.size <= MAX_DIFF_BYTES && conflict.server.size <= MAX_DIFF_BYTES && conflict.localPath !== null) {
			const local = await this.read(conflict.localPath);
			const server = await this.read(conflict.artifactPath);
			if (local !== null && server !== null) {
				section.createEl('pre', { text: lineDiff(new TextDecoder().decode(local), new TextDecoder().decode(server)) });
				return;
			}
		}
		section.createEl('pre', { text: [
			'Local: ' + (conflict.local.state === 'present' ? conflict.local.checksum + ' · ' + conflict.local.size + ' bytes' : 'deleted'),
			'Server: ' + (conflict.server.state === 'present' ? conflict.server.checksum + ' · ' + conflict.server.size + ' bytes' : 'deleted'),
		].join('\n') });
	}

	private async resolve(conflict: PersistedConflictState, resolution: ConflictResolution, keepBothPath?: string): Promise<void> {
		try {
			await this.resolveConflict(conflict.conflictId, resolution, keepBothPath);
			new Notice('ABCM conflict resolved.');
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'ABCM conflict resolution failed.');
		}
	}
}
