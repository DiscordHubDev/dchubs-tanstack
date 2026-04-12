function toDisplayMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}

	return String(error);
}

function isIgnoredMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("aborted") ||
		normalized.includes("cancelled") ||
		normalized.includes("canceled") ||
		normalized.includes("request error") ||
		normalized.includes("request failed with status 404") ||
		normalized.includes("request failed with status code 404")
	);
}

function shouldIgnoreError(error: unknown): boolean {
	if (error instanceof DOMException && error.name === "AbortError") {
		return true;
	}

	if (error instanceof Error) {
		return isIgnoredMessage(error.message);
	}

	if (typeof error === "string") {
		return isIgnoredMessage(error);
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return isIgnoredMessage(error.message);
	}

	return false;
}

export function showErrorAlert(error: unknown, title = "Error") {
	if (typeof window === "undefined") return;
	if (shouldIgnoreError(error)) return;

	void import("sweetalert2").then(({ default: Swal }) => {
		void Swal.fire({
			icon: "error",
			title,
			text: toDisplayMessage(error),
			confirmButtonText: "關閉",
			heightAuto: false,
		});
	});
}
