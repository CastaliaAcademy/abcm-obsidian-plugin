export interface HttpRequest {
	url: string;
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string;
}

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	json: unknown;
	arrayBuffer: ArrayBuffer;
}

export interface HttpTransport {
	request(request: HttpRequest): Promise<HttpResponse>;
}

export function responseJson(headers: Record<string, string>, readJson: () => unknown): unknown {
	const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
	if (contentType === undefined) return undefined;
	const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
	if (mediaType !== 'application/json' && mediaType?.endsWith('+json') !== true) return undefined;
	return readJson();
}

export class AbcmTransportError extends Error {
	readonly cause: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = 'AbcmTransportError';
		this.cause = cause;
	}
}

const SECRET_PATTERNS = [
	/\bBearer\s+\S+/giu,
	/\bobs_device_[A-Za-z0-9_-]+\b/gu,
	/\bpair_[A-Za-z0-9_-]+\b/gu,
] as const;

export function transportFailureMessage(error: unknown): string {
	if (!(error instanceof Error) || error.message.trim() === '') return 'ABCM service is unreachable.';
	let detail = error.message.replace(/[\r\n\t]+/gu, ' ').trim();
	for (const pattern of SECRET_PATTERNS) detail = detail.replace(pattern, '[redacted]');
	if (detail.length > 240) detail = `${detail.slice(0, 237)}...`;
	return `ABCM service is unreachable: ${detail}`;
}
