const MAX_DIFF_LINES = 200;

export function lineDiff(local: string, server: string): string {
	const localLines = local.split('\n');
	const serverLines = server.split('\n');
	const lines: string[] = [];
	for (let index = 0; index < Math.max(localLines.length, serverLines.length) && lines.length < MAX_DIFF_LINES; index += 1) {
		const left = localLines[index];
		const right = serverLines[index];
		if (left === right) lines.push('  ' + (left ?? ''));
		else {
			if (left !== undefined) lines.push('- ' + left);
			if (right !== undefined) lines.push('+ ' + right);
		}
	}
	if (Math.max(localLines.length, serverLines.length) > MAX_DIFF_LINES) lines.push('… diff truncated …');
	return lines.join('\n');
}
