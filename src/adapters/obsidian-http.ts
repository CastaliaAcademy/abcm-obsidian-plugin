import { requestUrl } from 'obsidian';
import { AbcmTransportError, responseJson, transportFailureMessage, type HttpRequest, type HttpResponse, type HttpTransport } from '../api/http';

export class ObsidianHttpTransport implements HttpTransport {
	async request(request: HttpRequest): Promise<HttpResponse> {
		try {
			const response = await requestUrl({
				url: request.url,
				method: request.method,
				headers: request.headers,
				...(request.body === undefined
					? {}
					: { contentType: 'application/json', body: request.body }),
				throw: false,
			});
			return {
				status: response.status,
				headers: response.headers,
				json: responseJson(response.headers, () => response.json),
				arrayBuffer: response.arrayBuffer,
			};
		} catch (error) {
			throw new AbcmTransportError(transportFailureMessage(error), error);
		}
	}
}
