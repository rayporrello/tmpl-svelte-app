declare global {
	namespace App {
		interface Locals {
			requestId: string;
		}
		interface Error {
			message: string;
			/** Request ID for user-reportable errors. Populated by handleError in hooks.server.ts. */
			requestId?: string;
		}
	}
}

export {};
