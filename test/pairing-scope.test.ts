import { describe, expect, it } from 'vitest';

import {
	pairingScopeBinding,
	pairingScopeMatches,
} from '../src/pairing/scope-binding';
import { DEFAULT_SETTINGS } from '../src/settings/model';

describe('pairing scope binding', () => {
	it('binds persisted sync state to the exact server scope', () => {
		const scope = pairingScopeBinding({
			...DEFAULT_SETTINGS,
			workspaceId: 'castalia-public',
			projectId: 'abcm',
			projectPrefix: 'abcm',
		});
		if (scope === null) throw new Error('Expected a complete scope binding.');

		expect(scope).toEqual({
			workspaceId: 'castalia-public',
			projectId: 'abcm',
			projectPrefix: 'abcm',
		});
		expect(pairingScopeMatches(scope, scope)).toBe(true);
		expect(
			pairingScopeMatches(
				{ ...scope, projectId: 'forbidden-project' },
				scope,
			),
		).toBe(false);
	});

	it('rejects unbound legacy state and incomplete settings', () => {
		expect(pairingScopeBinding(DEFAULT_SETTINGS)).toBeNull();
		expect(
			pairingScopeMatches(null, {
				workspaceId: 'castalia-public',
				projectId: 'abcm',
				projectPrefix: 'abcm',
			}),
		).toBe(false);
	});
});
