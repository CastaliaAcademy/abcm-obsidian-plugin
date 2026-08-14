export interface HttpRequest {
	url: string;
	method: 'POST';
	headers: Record<string, string>;
	body: string;
}

export interface HttpResponse {
	status: number;
	json: unknown;
}

export interface HttpTransport {
	request(request: HttpRequest): Promise<HttpResponse>;
}
