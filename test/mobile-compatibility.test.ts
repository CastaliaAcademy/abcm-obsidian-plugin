import { describe, expect, it } from 'vitest';
import {
	assertPortablePath,
	planReplicaObject,
	portablePathKey,
	serializeSyncState,
} from '../src/sync';

describe('mobile compatibility boundary', () => {
	it('exports the sync core through browser-compatible modules', () => {
		expect(assertPortablePath).toBeTypeOf('function');
		expect(planReplicaObject).toBeTypeOf('function');
		expect(portablePathKey).toBeTypeOf('function');
		expect(serializeSyncState).toBeTypeOf('function');
	});
});
