export interface TimerHost {
	setTimeout(callback: () => void, delay: number): number;
	clearTimeout(handle: number): void;
}

export class ForegroundSyncTrigger {
	private handle: number | null = null;

	constructor(
		private readonly timers: TimerHost,
		private readonly run: () => void,
		private readonly debounceMs = 750,
	) {}

	change(): void {
		this.schedule(this.debounceMs);
	}

	resume(): void {
		this.schedule(0);
	}

	cancel(): void {
		if (this.handle !== null) this.timers.clearTimeout(this.handle);
		this.handle = null;
	}

	private schedule(delay: number): void {
		this.cancel();
		this.handle = this.timers.setTimeout(() => {
			this.handle = null;
			this.run();
		}, delay);
	}
}


const CONFLICT_ROOT = '_ABCM Conflicts';

export function isVaultConfigPath(path: string, configDir: string): boolean {
	return path === configDir || path.startsWith(`${configDir}/`);
}

export function assertSafeVaultFolder(vaultFolder: string, configDir: string): void {
	if (vaultFolder !== '' && isVaultConfigPath(vaultFolder, configDir)) {
		throw new Error('ABCM Sync vault folder cannot be inside the Obsidian configuration directory.');
	}
}

export function isSynchronizedVaultPath(path: string, vaultFolder: string, configDir: string): boolean {
	const relative = vaultFolder === ''
		? path
		: path.startsWith(`${vaultFolder}/`)
			? path.slice(vaultFolder.length + 1)
			: '';
	if (relative === '') return false;
	return !(
		isVaultConfigPath(relative, configDir) ||
		relative === CONFLICT_ROOT || relative.startsWith(`${CONFLICT_ROOT}/`)
	);
}
