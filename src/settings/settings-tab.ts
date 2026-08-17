import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type AbcmSyncPlugin from '../main';
import { parsePatternList } from './model';

export class AbcmSyncSettingTab extends PluginSettingTab {
	private pairingCode = '';

	constructor(private readonly plugin: AbcmSyncPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Endpoint')
			.setDesc('Service URL. HTTPS is required except on localhost.')
			.addText((text) =>
				text
					.setPlaceholder('https://abcm.example.com')
					.setValue(this.plugin.settings.endpoint)
					.onChange(async (endpoint) => {
						await this.plugin.updateSettings({ endpoint });
					}),
			);

		new Setting(containerEl)
			.setName('Device name')
			.setDesc('Name shown to service administrators.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.deviceName)
					.onChange(async (deviceName) => {
						await this.plugin.updateSettings({ deviceName });
					}),
			);

		new Setting(containerEl)
			.setName('Workspace')
			.setDesc('Assigned by the one-time pairing code.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.workspaceId || 'Not paired')
					.setDisabled(true),
			);

		new Setting(containerEl)
			.setName('Project')
			.setDesc('Assigned by the one-time pairing code.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.projectId || 'Not paired')
					.setDisabled(true),
			);

		new Setting(containerEl)
			.setName('Vault folder')
			.setDesc('Relative folder to synchronize. Leave empty for the vault root.')
			.addText((text) =>
				text
					.setPlaceholder('ABCM')
					.setValue(this.plugin.settings.vaultFolder)
					.onChange(async (vaultFolder) => {
						await this.plugin.updateSettings({ vaultFolder });
					}),
			);

		new Setting(containerEl)
			.setName('Include patterns')
			.setDesc('Comma or newline separated patterns. Empty means all files.')
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.include.join('\n'))
					.onChange(async (value) => {
						try {
							await this.plugin.updateSettings({
								include: parsePatternList(value),
							});
						} catch (error) {
							new Notice(this.message(error));
						}
					}),
			);

		new Setting(containerEl)
			.setName('Exclude patterns')
			.setDesc('Comma or newline separated patterns.')
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.exclude.join('\n'))
					.onChange(async (value) => {
						try {
							await this.plugin.updateSettings({
								exclude: parsePatternList(value),
							});
						} catch (error) {
							new Notice(this.message(error));
						}
					}),
			);

		new Setting(containerEl)
			.setName('Sync interval')
			.setDesc('Foreground polling interval in seconds.')
			.addSlider((slider) =>
				slider
					.setLimits(15, 600, 15)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.intervalSeconds)
					.onChange(async (intervalSeconds) => {
						await this.plugin.updateSettings({ intervalSeconds });
					}),
			);

		new Setting(containerEl)
			.setName('Pairing code')
			.setDesc('One-time code created by a service administrator.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text.setPlaceholder(['pair', '_...'].join('')).onChange((pairingCode) => {
					this.pairingCode = pairingCode.trim();
				});
			})
			.addButton((button) =>
				button
					.setButtonText('Pair device')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						try {
							await this.plugin.pair(this.pairingCode);
							this.pairingCode = '';
							new Notice('Device paired.');
							this.display();
						} catch (error) {
							new Notice(this.message(error));
						} finally {
							button.setDisabled(false);
						}
					}),
			);

		new Setting(containerEl)
			.setName('Pause synchronization')
			.setDesc('Stop foreground events, polling, and retries without deleting the cursor or outbox.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.paused).onChange(async () => {
					await this.plugin.togglePause();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Re-pair device')
			.setDesc('Clear the current device credential while preserving local synchronization state for safe recovery.')
			.addButton((button) =>
				button.setButtonText('Clear authorization').setWarning().onClick(async () => {
					await this.plugin.rePair();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Manual synchronization')
			.setDesc('Run one foreground synchronization cycle.')
			.addButton((button) =>
				button.setButtonText('Sync now').onClick(async () => {
					await this.plugin.syncNow();
				}),
			);
	}

	private message(error: unknown): string {
		return error instanceof Error ? error.message : 'ABCM operation failed.';
	}
}
