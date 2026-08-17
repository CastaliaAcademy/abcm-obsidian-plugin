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

export class AbcmTransportError extends Error {
	readonly cause: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = 'AbcmTransportError';
		this.cause = cause;
	}
}
