export function contentTypeForPath(path: string): string {
	const lower = path.toLowerCase();
	if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
	if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml; charset=utf-8';
	if (lower.endsWith('.ts') || lower.endsWith('.js')) return 'text/plain; charset=utf-8';
	return 'application/octet-stream';
}

