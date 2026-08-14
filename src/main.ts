import {
	arrayBufferToBase64,
	Notice,
	Platform,
	Plugin,
} from 'obsidian';
import { ObsidianHttpTransport } from './adapters/obsidian-http';
import { ObsidianVaultReplica } from './adapters/obsidian-vault';
import { AbcmSyncClient } from './api/sync-client';
import { pairDevice } from './pairing/pairing-service';
import {
	DEVICE_CREDENTIAL_SECRET_ID,
	normalizeSettings,
	validateSettings,
	type AbcmSyncSettings,
	type SupportedPlatform,
} from './settings/model';
import { AbcmSyncSettingTab } from './settings/settings-tab';
import { confirmInitialSync } from './ui/initial-sync-modal';
import {
	createInitialSyncState,
	hydrateSyncState,
	runSyncCycle,
	type SyncChecksum,
} from './sync';

const LOCAL_STATE_KEY = 'abcm-sync-state-v1';

function randomId(prefix: 'device' | 'op'): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return `${prefix}_${[...bytes]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')}`;
}

async function checksum(content: ArrayBuffer): Promise<SyncChecksum> {
	const digest = await crypto.subtle.digest('SHA-256', content);
	return `sha256:${[...new Uint8Array(digest)]
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
	private syncInProgress = false;

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
		this.registerInterval(
			window.setInterval(() => {
				void this.syncNow(false);
			}, this.settings.intervalSeconds * 1_000),
		);
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
				deviceId: this.settings.deviceId ?? randomId('device'),
				platform: currentPlatform(),
			},
		);
		this.settings = next;
	}

	async syncNow(notify = true): Promise<void> {
		if (this.syncInProgress) {
			if (notify) new Notice(`${this.manifest.name} synchronization is already running.`);
			return;
		}
		this.syncInProgress = true;
		try {
			const settings = validateSettings(this.settings);
			const credential = this.app.secretStorage.getSecret(
				DEVICE_CREDENTIAL_SECRET_ID,
			);
			if (!this.isPaired() || credential === null || settings.deviceId === null) {
				if (!notify) return;
				throw new Error('Pair this device before synchronizing.');
			}
			const stored: unknown = this.app.loadLocalStorage(LOCAL_STATE_KEY);
			const state = stored === null
				? createInitialSyncState()
				: hydrateSyncState(stored);
			const client = new AbcmSyncClient(
				new ObsidianHttpTransport(),
				settings.endpoint,
				settings.workspaceId,
				settings.projectId,
				credential,
			);
			await runSyncCycle(
				client,
				new ObsidianVaultReplica(this.app.vault, settings.vaultFolder),
				{
					state,
					deviceId: settings.deviceId,
					include: settings.include,
					exclude: settings.exclude,
					operationId: () => randomId('op'),
					checksum,
					base64: arrayBufferToBase64,
					confirmInitialPreview: (preview) => notify
						? confirmInitialSync(this.app, preview)
						: Promise.resolve(false),
					persistState: (next) => {
						this.app.saveLocalStorage(LOCAL_STATE_KEY, next);
					},
				},
			);
			if (notify) new Notice(`${this.manifest.name} synchronization completed.`);
		} catch (error) {
			if (notify) {
				new Notice(
					error instanceof Error
						? error.message
						: 'ABCM synchronization failed.',
				);
			}
		} finally {
			this.syncInProgress = false;
		}
	}

	private isPaired(): boolean {
		return (
			this.settings.credentialSecretId === DEVICE_CREDENTIAL_SECRET_ID &&
			this.app.secretStorage.getSecret(DEVICE_CREDENTIAL_SECRET_ID) !== null &&
			this.settings.deviceId !== null &&
			this.settings.workspaceId !== '' &&
			this.settings.projectId !== ''
		);
	}
}
