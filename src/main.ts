import { Notice, Platform, Plugin } from 'obsidian';
import { ObsidianHttpTransport } from './adapters/obsidian-http';
import { pairDevice } from './pairing/pairing-service';
import {
	DEVICE_CREDENTIAL_SECRET_ID,
	normalizeSettings,
	validateSettings,
	type AbcmSyncSettings,
	type SupportedPlatform,
} from './settings/model';
import { AbcmSyncSettingTab } from './settings/settings-tab';

function deviceId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return `device_${[...bytes]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')}`;
}

function currentPlatform(): SupportedPlatform {
	if (Platform.isIosApp) return 'ipados';
	if (Platform.isWin) return 'windows';
	if (Platform.isLinux) return 'linux';
	throw new Error('This ABCM Sync build supports Windows, Linux, and iPadOS.');
}

export default class AbcmSyncPlugin extends Plugin {
	settings!: AbcmSyncSettings;

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.addSettingTab(new AbcmSyncSettingTab(this));
		this.addCommand({
			id: 'sync-now',
			name: 'Sync now',
			callback: () => {
				void this.syncNow();
			},
		});
		this.addCommand({
			id: 'show-sync-status',
			name: 'Show sync status',
			callback: () => {
				new Notice(
					this.isPaired()
						? `${this.manifest.name} is paired with ${this.settings.workspaceId}/${this.settings.projectId}.`
						: `${this.manifest.name} is not paired.`,
				);
			},
		});
	}

	async updateSettings(update: Partial<AbcmSyncSettings>): Promise<void> {
		this.settings = { ...this.settings, ...update };
		await this.saveData(this.settings);
	}

	async pair(pairingCode: string): Promise<void> {
		const next = await pairDevice(
			new ObsidianHttpTransport(),
			this.app.secretStorage,
			async (settings) => {
				await this.saveData(settings);
			},
			this.settings,
			{
				pairingCode,
				deviceId: this.settings.deviceId ?? deviceId(),
				platform: currentPlatform(),
			},
		);
		this.settings = next;
	}

	async syncNow(): Promise<void> {
		try {
			validateSettings(this.settings);
			if (!this.isPaired()) {
				throw new Error('Pair this device before synchronizing.');
			}
			new Notice('Synchronization transport will be enabled by the next work unit.');
		} catch (error) {
			new Notice(
				error instanceof Error ? error.message : 'ABCM synchronization failed.',
			);
		}
	}

	private isPaired(): boolean {
		return (
			this.settings.credentialSecretId === DEVICE_CREDENTIAL_SECRET_ID &&
			this.app.secretStorage.getSecret(DEVICE_CREDENTIAL_SECRET_ID) !== null &&
			this.settings.workspaceId !== '' &&
			this.settings.projectId !== ''
		);
	}
}
