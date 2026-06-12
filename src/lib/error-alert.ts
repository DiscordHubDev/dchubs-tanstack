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

type ErrorAlertPriority = "normal" | "critical";

type ErrorAlertOptions = {
	priority?: ErrorAlertPriority;
};

type ErrorAlertItem = {
	title: string;
	message: string;
	priority: ErrorAlertPriority;
};

const normalQueue: ErrorAlertItem[] = [];
const criticalQueue: ErrorAlertItem[] = [];
let isShowingAlert = false;
let activeAlert: ErrorAlertItem | null = null;

async function getSwal() {
	const { default: Swal } = await import("sweetalert2");
	return Swal;
}

async function showAlert(item: ErrorAlertItem) {
	isShowingAlert = true;
	activeAlert = item;

	let unhideObserver: MutationObserver | null = null;

	try {
		const Swal = await getSwal();
		await Swal.fire({
			icon: "error",
			title: item.title,
			text: item.message,
			confirmButtonText: "關閉",
			heightAuto: false,
			didOpen: (popup) => {
				const container = popup.closest(
					".swal2-container",
				) as HTMLElement | null;
				if (!container) return;

				const unhide = () => {
					container.removeAttribute("aria-hidden");
					container.removeAttribute("inert");
				};

				unhide();
				const observer = new MutationObserver(unhide);
				observer.observe(container, {
					attributes: true,
					attributeFilter: ["aria-hidden", "inert"],
				});

				// 賦值給外層
				unhideObserver = observer;
			},
		});
	} finally {
		// 這裡進行傳統的 null 檢查，可以幫 TypeScript 重新建立型別防線
		if (unhideObserver) {
			(unhideObserver as MutationObserver).disconnect();
		}
		unhideObserver = null;
		activeAlert = null;
		isShowingAlert = false;
		void processQueue();
	}
}

async function processQueue() {
	if (isShowingAlert) return;

	const next = criticalQueue.shift() ?? normalQueue.shift();
	if (!next) return;

	await showAlert(next);
}

async function preemptNormalAlert() {
	if (!activeAlert || activeAlert.priority !== "normal") return;

	normalQueue.unshift(activeAlert);
	activeAlert = null;

	const Swal = await getSwal();
	Swal.close();
}

export function showErrorAlert(
	error: unknown,
	title = "Error",
	options?: ErrorAlertOptions,
) {
	if (typeof window === "undefined") return;
	if (shouldIgnoreError(error)) return;

	const item: ErrorAlertItem = {
		title,
		message: toDisplayMessage(error),
		priority: options?.priority ?? "normal",
	};

	if (item.priority === "critical") {
		criticalQueue.push(item);
		void preemptNormalAlert().finally(() => {
			void processQueue();
		});
		return;
	}

	normalQueue.push(item);
	void processQueue();
}
