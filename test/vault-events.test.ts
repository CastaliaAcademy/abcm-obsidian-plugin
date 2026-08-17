import { describe, expect, it, vi } from 'vitest';
import { ForegroundSyncTrigger, isSynchronizedVaultPath } from '../src/sync';

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
		expect(isSynchronizedVaultPath('ABCM/note.md', 'ABCM', '.obsidian')).toBe(true);
		expect(isSynchronizedVaultPath('other/note.md', 'ABCM', '.obsidian')).toBe(false);
		expect(isSynchronizedVaultPath('ABCM/.obsidian/plugins.json', 'ABCM', '.obsidian')).toBe(false);
		expect(isSynchronizedVaultPath('ABCM/_ABCM Conflicts/c-1/server-note.md', 'ABCM', '.obsidian')).toBe(false);
	});
});
