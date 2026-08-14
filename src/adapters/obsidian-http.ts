import { requestUrl } from 'obsidian';
import type { HttpRequest, HttpResponse, HttpTransport } from '../api/http';

export class ObsidianHttpTransport implements HttpTransport {
	async request(request: HttpRequest): Promise<HttpResponse> {
		const response = await requestUrl({
			url: request.url,
			method: request.method,
			headers: request.headers,
			contentType: 'application/json',
			body: request.body,
			throw: false,
		});
		return { status: response.status, json: response.json };
	}
}
