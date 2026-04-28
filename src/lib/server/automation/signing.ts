import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 signature for webhook payloads.
 *
 * Send as `X-Webhook-Signature` header. Verify on the receiver side by
 * computing the same signature over the raw request body and comparing with
 * `timingSafeEqual` to prevent timing attacks.
 */
export function signWebhookPayload(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}
