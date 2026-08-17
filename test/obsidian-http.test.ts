import { describe, expect, it, vi } from 'vitest';

import { responseJson } from '../src/api/http';

describe('Obsidian HTTP transport', () => {
	it('does not parse project file content as JSON', async () => {
		const readJson = vi.fn(() => { throw new SyntaxError('project content is not JSON'); });

		expect(responseJson({ 'Content-Type': 'application/yaml; charset=utf-8' }, readJson)).toBeUndefined();
		expect(readJson).not.toHaveBeenCalled();
	});

	it('parses structured JSON and problem responses', async () => {
		const body = { previewId: 'preview_1' };
		const readJson = vi.fn(() => body);

		expect(responseJson({ 'content-type': 'application/problem+json' }, readJson)).toBe(body);
		expect(readJson).toHaveBeenCalledOnce();
	});
});
