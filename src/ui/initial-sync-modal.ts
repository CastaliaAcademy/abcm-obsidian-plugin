import { Modal, Setting, type App } from 'obsidian';
import type { PreviewResult } from '../api/sync-client';

function mutationSummary(preview: PreviewResult): string {
	const counts = new Map<string, number>();
	for (const item of preview.items) {
		counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
	}
	const summary = [...counts.entries()]
		.filter(([action]) => action !== 'noop')
		.map(([action, count]) => `${action}: ${count}`)
		.join(', ');
	return summary === '' ? 'No file changes are planned.' : summary;
}

class InitialSyncModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly preview: PreviewResult,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Confirm initial synchronization');
		this.contentEl.createEl('p', {
			text: 'Review the pinned preview before changing the vault or remote project.',
		});
		this.contentEl.createEl('p', { text: mutationSummary(this.preview) });
		new Setting(this.contentEl)
			.addButton((button) => button
				.setButtonText('Cancel')
				.onClick(() => this.finish(false)))
			.addButton((button) => button
				.setButtonText('Synchronize')
				.setCta()
				.onClick(() => this.finish(true)));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.settled = true;
			this.resolve(false);
		}
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}
}

export function confirmInitialSync(
	app: App,
	preview: PreviewResult,
): Promise<boolean> {
	return new Promise((resolve) => {
		new InitialSyncModal(app, preview, resolve).open();
	});
}
