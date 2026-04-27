export function getOrCreateRequestId(request: Request): string {
	return request.headers.get('x-request-id') ?? crypto.randomUUID();
}
