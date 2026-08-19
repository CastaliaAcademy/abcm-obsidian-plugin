import { describe, expect, it } from 'vitest';

import { contentTypeForPath } from '../src/sync/content-type';

describe('vault content type', () => {
	it('declares known text formats consistently with the ABCM file boundary', () => {
		expect(contentTypeForPath('notes/readme.md')).toBe('text/markdown; charset=utf-8');
		expect(contentTypeForPath('notes/README.MD')).toBe('text/markdown; charset=utf-8');
		expect(contentTypeForPath('config/data.json')).toBe('application/json; charset=utf-8');
		expect(contentTypeForPath('config/scope.yaml')).toBe('application/yaml; charset=utf-8');
		expect(contentTypeForPath('config/scope.yml')).toBe('application/yaml; charset=utf-8');
		expect(contentTypeForPath('src/plugin.ts')).toBe('text/plain; charset=utf-8');
	});

	it('keeps unknown and binary files opaque', () => {
		expect(contentTypeForPath('assets/probe.bin')).toBe('application/octet-stream');
		expect(contentTypeForPath('assets/image.png')).toBe('application/octet-stream');
	});
});
