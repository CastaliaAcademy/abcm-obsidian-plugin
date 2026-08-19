import {
	arrayBufferToBase64,
	Notice,
	Platform,
	Plugin,
	TFile,
	type TAbstractFile,
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
import { ConflictModal } from './ui/conflict-modal';
import { confirmInitialSync } from './ui/initial-sync-modal';
import {
	classifySyncFailure,
	createInitialSyncState,
	ForegroundSyncTrigger,
	isSynchronizedVaultPath,
	hydrateSyncState,
	recordPendingMove,
	relativeSynchronizedVaultPath,
	resolvePersistedConflict,
	retryDelayMs,
	runSyncCycle,
	type PersistedSyncState,
	type SyncChecksum,
} from './sync';

const LOCAL_STATE_KEY = 'abcm-sync-state-v1';

type SyncStatus =
	| 'synced'
	| 'syncing'
	| 'offline'
	| 'paused'
	| 'conflict'
	| 'auth-required'
	| 'not-paired'
	| 'error';

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
	private syncQueued = false;
	private foregroundStarted = false;
	private retryAttempt = 0;
	private retryHandle: number | null = null;
	private status: SyncStatus = 'not-paired';
	private statusItem!: HTMLElement;
	private trigger!: ForegroundSyncTrigger;

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.statusItem = this.addStatusBarItem();
		this.trigger = new ForegroundSyncTrigger(
			{
				setTimeout: (callback, delay) => window.setTimeout(callback, delay),
				clearTimeout: (handle) => window.clearTimeout(handle),
			},
			() => { void this.syncNow(false); },
		);
		this.register(() => {
			this.trigger.cancel();
			this.clearRetry();
		});
		this.addSettingTab(new AbcmSyncSettingTab(this));
		this.addRibbonIcon('refresh-cw', 'Synchronize ABCM', () => { void this.syncNow(); });
		this.registerCommands();
		this.setStatus(this.settings.paused ? 'paused' : this.isPaired() ? 'synced' : 'not-paired');

		this.app.workspace.onLayoutReady(() => { this.startForegroundSync(); });
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (document.visibilityState === 'visible') this.trigger.resume();
		});
	}

	async updateSettings(update: Partial<AbcmSyncSettings>): Promise<void> {
		this.settings = { ...this.settings, ...update };
		await this.saveData(this.settings);
		if (this.settings.paused) {
			this.trigger.cancel();
			this.clearRetry();
			this.setStatus('paused');
		}
	}

	async pair(pairingCode: string): Promise<void> {
		const next = await pairDevice(
			new ObsidianHttpTransport(),
			this.app.secretStorage,
			async (settings) => { await this.saveData({ ...settings, paused: false }); },
			this.settings,
			{
				pairingCode,
				deviceId: this.settings.deviceId ?? randomId('device'),
				platform: currentPlatform(),
			},
		);
		this.settings = { ...next, paused: false };
		this.retryAttempt = 0;
		this.clearRetry();
		this.setStatus('synced');
		this.trigger.resume();
	}

	async togglePause(): Promise<void> {
		await this.updateSettings({ paused: !this.settings.paused });
		if (!this.settings.paused) {
			this.setStatus(this.isPaired() ? 'synced' : 'not-paired');
			this.trigger.resume();
		}
		new Notice(`${this.manifest.name} synchronization ${this.settings.paused ? 'paused' : 'resumed'}.`);
	}

	async rePair(): Promise<void> {
		this.app.secretStorage.setSecret(DEVICE_CREDENTIAL_SECRET_ID, '');
		this.settings = {
			...this.settings,
			workspaceId: '',
			projectId: '',
			projectPrefix: null,
			credentialSecretId: null,
			paused: true,
		};
		await this.saveData(this.settings);
		this.trigger.cancel();
		this.clearRetry();
		this.setStatus('auth-required');
		new Notice('ABCM device authorization was cleared. Enter a new pairing code in settings.');
	}

	async syncNow(notify = true): Promise<void> {
		if (this.syncInProgress) {
			this.syncQueued = true;
			if (notify) new Notice(`${this.manifest.name} synchronization is already running.`);
			return;
		}
		if (this.settings.paused) {
			this.setStatus(this.status === 'auth-required' ? 'auth-required' : 'paused');
			if (notify) new Notice(`${this.manifest.name} synchronization is paused.`);
			return;
		}
		this.syncInProgress = true;
		this.setStatus('syncing');
		try {
			const credential = this.app.secretStorage.getSecret(DEVICE_CREDENTIAL_SECRET_ID);
			const deviceId = this.settings.deviceId;
			if (!this.isPaired() || credential === null || credential === '' || deviceId === null) {
				this.setStatus('not-paired');
				if (!notify) return;
				throw new Error('Pair this device before synchronizing.');
			}
			const settings = validateSettings(this.settings);
			const state = this.loadSyncState();
			if (!notify && state.cursor === null && state.objects.length === 0) {
				this.setStatus('paused');
				return;
			}
			const client = new AbcmSyncClient(
				new ObsidianHttpTransport(),
				settings.endpoint,
				settings.workspaceId,
				settings.projectId,
				credential,
			);
			const next = await runSyncCycle(
				client,
				new ObsidianVaultReplica(this.app.vault, this.app.fileManager, settings.vaultFolder),
				{
					state,
					deviceId,
					include: settings.include,
					exclude: settings.exclude,
					operationId: () => randomId('op'),
					checksum,
					base64: arrayBufferToBase64,
					confirmInitialPreview: (preview) => notify
						? confirmInitialSync(this.app, preview)
						: Promise.resolve(false),
					persistState: (persisted) => { this.app.saveLocalStorage(LOCAL_STATE_KEY, persisted); },
				},
			);
			this.retryAttempt = 0;
			this.clearRetry();
			this.setStatus(next.conflicts.length > 0 ? 'conflict' : 'synced');
			if (notify) new Notice(`${this.manifest.name} synchronization completed.`);
		} catch (error) {
			const kind = classifySyncFailure(error);
			if (kind === 'auth-required') {
				this.settings = { ...this.settings, paused: true };
				await this.saveData(this.settings);
				this.clearRetry();
				this.setStatus('auth-required');
			} else if (kind === 'retryable') {
				this.setStatus('offline');
				this.scheduleRetry();
			} else {
				this.setStatus('error');
			}
			if (notify) new Notice(error instanceof Error ? error.message : 'ABCM synchronization failed.');
		} finally {
			this.syncInProgress = false;
			if (this.syncQueued) {
				this.syncQueued = false;
				this.trigger.resume();
			}
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'pair-device',
			name: 'Pair device',
			callback: () => { new Notice('Open ABCM Sync settings and enter a one-time pairing code.'); },
		});
		this.addCommand({ id: 'preview-initial-sync', name: 'Preview initial sync', callback: () => { void this.syncNow(true); } });
		this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => { void this.syncNow(); } });
		this.addCommand({ id: 'show-conflicts', name: 'Show conflicts', callback: () => { void this.showConflicts(); } });
		this.addCommand({ id: 'pause-sync', name: 'Pause or resume synchronization', callback: () => { void this.togglePause(); } });
		this.addCommand({ id: 're-pair', name: 'Re-pair device', callback: () => { void this.rePair(); } });
		this.addCommand({
			id: 'show-sync-status',
			name: 'Show sync status',
			callback: () => { new Notice(`${this.manifest.name}: ${this.status}.`); },
		});
	}

	private startForegroundSync(): void {
		if (this.foregroundStarted) return;
		this.foregroundStarted = true;
		const changed = (file: TAbstractFile): void => {
			if (file instanceof TFile && isSynchronizedVaultPath(file.path, this.settings.vaultFolder, this.app.vault.configDir)) this.trigger.change();
		};
		this.registerEvent(this.app.vault.on('create', changed));
		this.registerEvent(this.app.vault.on('modify', changed));
		this.registerEvent(this.app.vault.on('delete', changed));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (!(file instanceof TFile)) return;
			const previousPath = relativeSynchronizedVaultPath(oldPath, this.settings.vaultFolder, this.app.vault.configDir);
			const path = relativeSynchronizedVaultPath(file.path, this.settings.vaultFolder, this.app.vault.configDir);
			if (!this.syncInProgress && previousPath !== null && path !== null) {
				const state = this.loadSyncState();
				const next = recordPendingMove(state, previousPath, path);
				if (next !== state) this.app.saveLocalStorage(LOCAL_STATE_KEY, next);
			}
			if (
				isSynchronizedVaultPath(file.path, this.settings.vaultFolder, this.app.vault.configDir) ||
				isSynchronizedVaultPath(oldPath, this.settings.vaultFolder, this.app.vault.configDir)
			) this.trigger.change();
		}));
		this.registerInterval(window.setInterval(() => { this.trigger.resume(); }, this.settings.intervalSeconds * 1_000));
		this.trigger.resume();
	}

	private scheduleRetry(): void {
		if (this.retryHandle !== null || this.settings.paused) return;
		const delay = retryDelayMs(this.retryAttempt);
		this.retryAttempt += 1;
		this.retryHandle = window.setTimeout(() => {
			this.retryHandle = null;
			void this.syncNow(false);
		}, delay);
	}

	private clearRetry(): void {
		if (this.retryHandle !== null) window.clearTimeout(this.retryHandle);
		this.retryHandle = null;
	}

	private setStatus(status: SyncStatus): void {
		this.status = status;
		this.statusItem.textContent = `ABCM: ${status}`;
		this.statusItem.setAttribute('aria-label', `ABCM synchronization status: ${status}`);
	}

	private loadSyncState(): PersistedSyncState {
		const stored: unknown = this.app.loadLocalStorage(LOCAL_STATE_KEY);
		return stored === null ? createInitialSyncState() : hydrateSyncState(stored);
	}

	private async showConflicts(): Promise<void> {
		try {
			const settings = validateSettings(this.settings);
			const credential = this.app.secretStorage.getSecret(DEVICE_CREDENTIAL_SECRET_ID);
			if (!this.isPaired() || credential === null || credential === '' || settings.deviceId === null) throw new Error('Pair this device before resolving conflicts.');
			const state = this.loadSyncState();
			if (state.conflicts.length === 0) {
				new Notice('ABCM Sync has no pending conflicts.');
				return;
			}
			const client = new AbcmSyncClient(new ObsidianHttpTransport(), settings.endpoint, settings.workspaceId, settings.projectId, credential);
			const replica = new ObsidianVaultReplica(this.app.vault, this.app.fileManager, settings.vaultFolder);
			new ConflictModal(this.app, state.conflicts, settings.vaultFolder, async (conflictId, resolution, keepBothPath) => {
				await resolvePersistedConflict(client, replica, state, conflictId, resolution, keepBothPath, {
					operationId: () => randomId('op'),
					checksum,
					persistState: (next) => { this.app.saveLocalStorage(LOCAL_STATE_KEY, next); },
				});
				await this.syncNow(false);
			}).open();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'ABCM conflict view failed.');
		}
	}

	private isPaired(): boolean {
		const credential = this.app.secretStorage.getSecret(DEVICE_CREDENTIAL_SECRET_ID);
		return (
			this.settings.credentialSecretId === DEVICE_CREDENTIAL_SECRET_ID &&
			credential !== null && credential !== '' &&
			this.settings.deviceId !== null &&
			this.settings.workspaceId !== '' &&
			this.settings.projectId !== ''
		);
	}
}
