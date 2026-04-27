const FALLBACK_MESSAGE = 'An unexpected error occurred. Please try again.';

export interface SafeError {
	publicMessage: string;
	diagnostic: {
		errorType: string;
		errorMessage: string;
	};
}

export function toSafeError(error: unknown): SafeError {
	if (error instanceof Error) {
		return {
			publicMessage: FALLBACK_MESSAGE,
			diagnostic: {
				errorType: error.name,
				errorMessage: error.message
			}
		};
	}
	return {
		publicMessage: FALLBACK_MESSAGE,
		diagnostic: {
			errorType: 'UnknownError',
			errorMessage: String(error)
		}
	};
}
