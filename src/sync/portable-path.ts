const WINDOWS_RESERVED_BASENAME =
	/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

const PORTABLE_PATH_MAX_LENGTH = 1_024;
const ABCM_DEFAULT_CONFIG_ROOT = ['.ob', 'sidian'].join('');

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
			return true;
		}
	}
	return false;
}

export function portablePathKey(path: string): string {
	return path.normalize('NFC').toLocaleLowerCase('en-US');
}

export function assertPortablePath(path: string): void {
	if (path.length === 0 || path.length > PORTABLE_PATH_MAX_LENGTH) {
		throw new Error('Portable path length is invalid.');
	}
	if (path !== path.normalize('NFC')) {
		throw new Error('Portable path must use Unicode NFC normalization.');
	}
	if (
		path.startsWith('/') ||
		path.includes('\\') ||
		containsControlCharacter(path)
	) {
		throw new Error('Path is not a portable relative path.');
	}
	const segments = path.split('/');
	if (
		segments.some(
			(segment) => segment === '' || segment === '.' || segment === '..',
		)
	) {
		throw new Error('Portable path contains an empty or traversal segment.');
	}
	for (const segment of segments) {
		if (segment.endsWith('.') || segment.endsWith(' ')) {
			throw new Error('Portable path segments must not end with a dot or space.');
		}
		if (WINDOWS_RESERVED_BASENAME.test(segment)) {
			throw new Error('Portable path contains a Windows reserved name.');
		}
	}
	const root = segments[0]?.toLocaleLowerCase('en-US');
	if (root === ABCM_DEFAULT_CONFIG_ROOT || root === '_abcm conflicts') {
		throw new Error('Portable path belongs to an excluded plugin directory.');
	}
}

export function assertPortableVaultPaths(paths: Iterable<string>): void {
	const seen = new Map<string, string>();
	for (const path of paths) {
		try {
			assertPortablePath(path);
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'Portable path is invalid.';
			throw new Error(`Vault path '${path}' is not portable: ${detail}`);
		}
		const key = portablePathKey(path);
		const previous = seen.get(key);
		if (previous !== undefined) {
			throw new Error(
				`Vault path '${path}' collides with '${previous}' under portable identity rules.`,
			);
		}
		seen.set(key, path);
	}
}
