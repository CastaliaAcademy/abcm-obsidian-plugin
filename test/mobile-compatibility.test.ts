/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import manifestText from '../manifest.json?raw';
import {
	assertPortablePath,
	planReplicaObject,
	portablePathKey,
	serializeSyncState,
} from '../src/sync';

const sourceModules = import.meta.glob('../src/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true,
});

describe('mobile compatibility boundary', () => {
	it('exports the sync core through browser-compatible modules', () => {
		expect(assertPortablePath).toBeTypeOf('function');
		expect(planReplicaObject).toBeTypeOf('function');
		expect(portablePathKey).toBeTypeOf('function');
		expect(serializeSyncState).toBeTypeOf('function');
	});

	it('keeps the production source free of desktop-only APIs', () => {
		const source = Object.values(sourceModules).join('\n');
		for (const forbidden of [
			/from ['"]node:/u,
			/require\(['"]node:/u,
			/from ['"]electron['"]/u,
			/FileSystemAdapter/u,
			/process\.platform/u,
			/(?:window|globalThis)\.fetch/u,
		]) expect(source).not.toMatch(forbidden);
		expect(source).toContain('requestUrl');
		expect(source).toContain('onLayoutReady');
	});

	it('declares the plugin as mobile-compatible', () => {
		const manifest = JSON.parse(manifestText) as { isDesktopOnly?: unknown };
		expect(manifest.isDesktopOnly).toBe(false);
	});
});
