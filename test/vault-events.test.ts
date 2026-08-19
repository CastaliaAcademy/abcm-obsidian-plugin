import { describe, expect, it, vi } from 'vitest';
import {
	assertSafeVaultFolder,
	ForegroundSyncTrigger,
	isSynchronizedVaultPath,
	isVaultConfigPath,
} from '../src/sync';

describe('foreground vault event coalescing', () => {
	it('debounces a burst and resumes immediately', () => {
		const run = vi.fn();
		let nextHandle = 0;
		const callbacks = new Map<number, () => void>();
		const trigger = new ForegroundSyncTrigger(
			{
				setTimeout: (callback) => { nextHandle += 1; const handle = nextHandle; callbacks.set(handle, () => { callbacks.delete(handle); callback(); }); return handle; },
				clearTimeout: (handle) => { callbacks.delete(handle); },
			},
			run,
			750,
		);
		trigger.change();
		trigger.change();
		expect(callbacks).toHaveLength(1);
		callbacks.values().next().value?.();
		expect(run).toHaveBeenCalledTimes(1);
		trigger.change();
		trigger.resume();
		expect(callbacks).toHaveLength(1);
		callbacks.values().next().value?.();
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('filters paths outside the mapping and service-owned folders', () => {
		const configDir = ['.ob', 'sidian'].join('');
		expect(isSynchronizedVaultPath('ABCM/note.md', 'ABCM', configDir)).toBe(true);
		expect(isSynchronizedVaultPath('other/note.md', 'ABCM', configDir)).toBe(false);
		expect(isSynchronizedVaultPath(`ABCM/${configDir}/plugins.json`, 'ABCM', configDir)).toBe(false);
		expect(isSynchronizedVaultPath('ABCM/_ABCM Conflicts/c-1/server-note.md', 'ABCM', configDir)).toBe(false);
	});

	it('excludes a custom configuration directory from root mappings and rejects nested mappings', () => {
		const configDir = '.vault-config';
		expect(isVaultConfigPath('.vault-config/plugins/abcm-sync/data.json', configDir)).toBe(true);
		expect(isSynchronizedVaultPath('.vault-config/plugins.json', '', configDir)).toBe(false);
		expect(isSynchronizedVaultPath('notes/architecture.md', '', configDir)).toBe(true);
		expect(() => assertSafeVaultFolder('', configDir)).not.toThrow();
		expect(() => assertSafeVaultFolder('notes', configDir)).not.toThrow();
		expect(() => assertSafeVaultFolder('.vault-config', configDir)).toThrow(/configuration directory/u);
		expect(() => assertSafeVaultFolder('.vault-config/plugins', configDir)).toThrow(/configuration directory/u);
	});
});
