import { Notice, Plugin } from 'obsidian';

export default class AbcmSyncPlugin extends Plugin {
	onload(): void {
		this.addCommand({
			id: 'show-sync-status',
			name: 'Show sync status',
			callback: () => {
				new Notice(`${this.manifest.name} is ready for configuration.`);
			},
		});
	}
}
