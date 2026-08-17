import { describe, expect, it } from 'vitest';
import { lineDiff } from '../src/ui/line-diff';

describe('mobile conflict comparison', () => {
	it('shows stable line-oriented text differences', () => {
		expect(lineDiff('same\nlocal', 'same\nserver')).toBe('  same\n- local\n+ server');
	});

	it('bounds the rendered comparison', () => {
		const local = Array.from({ length: 220 }, (_, index) => `local-${index}`).join('\n');
		const server = Array.from({ length: 220 }, (_, index) => `server-${index}`).join('\n');
		const result = lineDiff(local, server);
		expect(result).toContain('… diff truncated …');
		expect(result.split('\n').length).toBeLessThanOrEqual(201);
	});
});
