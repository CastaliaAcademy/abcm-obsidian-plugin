import { describe, expect, it } from 'vitest';
import { assertPortablePath, portablePathKey } from '../src/sync';

describe('portable project paths', () => {
	it('accepts normalized relative paths and creates a case-insensitive identity key', () => {
		expect(() => assertPortablePath('Notes/Café.md')).not.toThrow();
		expect(portablePathKey('Notes/Café.md')).toBe(portablePathKey('notes/café.md'));
	});

	it.each([
		'',
		'/absolute.md',
		'../escape.md',
		'folder/../escape.md',
		'folder\\note.md',
		'folder//note.md',
		'folder/trailing.',
		'folder/trailing ',
		'CON.md',
		'aux',
		'COM9.txt',
		'_ABCM Conflicts/server.md',
		['.ob', 'sidian', '/plugins.json'].join(''),
		'Notes/Cafe\u0301.md',
	])('rejects non-portable path %j', (path) => {
		expect(() => assertPortablePath(path)).toThrow();
	});

	it('rejects control characters and the length boundary', () => {
		expect(() => assertPortablePath('notes/line\nfeed.md')).toThrow();
		expect(() => assertPortablePath(`${'a'.repeat(1_022)}.md`)).toThrow();
	});
});
