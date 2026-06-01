import { useCallback, useMemo, useState } from "react";
import type { Bot, BotStatus } from "#/types/admin";
import { reviewBot } from "@/routes/api/admin";

interface UseBotApplicationsOptions {
	initial: readonly Bot[];
	onError?: (error: unknown) => void;
}

export function useBotApplications({
	initial,
	onError,
}: UseBotApplicationsOptions) {
	const [items, setItems] = useState<Bot[]>(() => [...initial]);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return items;
		return items.filter(
			(b) =>
				b.name.toLowerCase().includes(q) ||
				b.description.toLowerCase().includes(q) ||
				b.developers.some((d) => d.username.toLowerCase().includes(q)),
		);
	}, [items, search]);

	const review = useCallback(
		async (
			id: string,
			status: Extract<BotStatus, "approved" | "rejected">,
			reason?: string,
		) => {
			try {
				const result = await reviewBot({
					data: { id, status, rejectionReason: reason },
				});

				if (!result.success) {
					// 💡 修改點 2：直接把 result.error (或預設字串) 丟給 onError
					onError?.(result.error ?? "審核失敗");
					return false;
				}
				setItems((prev) =>
					prev.map((b) => (b.id === id ? { ...b, status } : b)),
				);
				return true;
			} catch (err) {
				// 💡 額外建議：既然用了 async/await，加上 try/catch 可以捕捉網路斷線等未預期錯誤
				onError?.(err);
				return false;
			}
		},
		[onError],
	);

	return { filtered, search, setSearch, review } as const;
}
