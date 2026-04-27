/**
 * EmailProvider seam — swap implementations without touching form actions.
 *
 * Usage:
 *   1. Default: console provider (logs to stdout). Works out of the box.
 *   2. Postmark: see providers/postmark.example.ts — rename to postmark.ts and
 *      replace the import in your route action.
 *   3. Custom: implement this interface and pass it to your action.
 */

export interface EmailPayload {
	/** Recipient address. */
	to: string;
	/** Sender address (must be verified in your email provider). */
	from: string;
	subject: string;
	/** Plain-text body — always required for deliverability. */
	text: string;
	/** Optional HTML body. */
	html?: string;
	/** Reply-To address — useful for contact forms (set to submitter's email). */
	replyTo?: string;
}

export interface EmailProvider {
	send(payload: EmailPayload): Promise<void>;
}
