import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	normalizeEndpoint,
	normalizeSettings,
	parsePatternList,
	validateSettings,
} from '../src/settings/model';

describe('ABCM Sync settings', () => {
	it('allows HTTPS and local HTTP but rejects unsafe remote HTTP', () => {
		expect(normalizeEndpoint('https://abcm.example.test/')).toBe(
			'https://abcm.example.test',
		);
		expect(normalizeEndpoint('http://127.0.0.1:8787')).toBe(
			'http://127.0.0.1:8787',
		);
		expect(() => normalizeEndpoint('http://abcm.example.test')).toThrow(
			'must use HTTPS',
		);
	});

	it('never hydrates unknown secret values into ordinary plugin settings', () => {
		const settings = normalizeSettings({
			...DEFAULT_SETTINGS,
			credential: 'plaintext-secret',
			endpoint: 'https://abcm.example.test',
		});
		expect(JSON.stringify(settings)).not.toContain('plaintext-secret');
		expect(validateSettings(settings).intervalSeconds).toBe(60);
	});

	it('normalizes bounded include and exclude lists', () => {
		expect(parsePatternList('docs/**, notes/*.md\ndocs/**')).toEqual([
			'docs/**',
			'notes/*.md',
		]);
	});
});
