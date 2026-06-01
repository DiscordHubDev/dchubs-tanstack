// ============================================================
// hooks/use-management.ts
// ============================================================
import { useCallback, useMemo, useState } from "react";
import { deleteBot, deleteServer } from "#/features/admin/admin.functions";
import type { Bot, DiscordServer, ManagedItem } from "#/types/admin";

interface UseManagementOptions {
	initialBots: readonly Bot[];
	initialServers: readonly DiscordServer[];
	onError?: (msg: string) => void;
}

export function useManagement({
	initialBots,
	initialServers,
	onError,
}: UseManagementOptions) {
	const [bots, setBots] = useState<Bot[]>(() => [...initialBots]);
	const [serverList, setServerList] = useState<DiscordServer[]>(() => [
		...initialServers,
	]);
	const [search, setSearch] = useState("");

	const filteredBots = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return bots;
		return bots.filter(
			(b) =>
				b.name.toLowerCase().includes(q) ||
				b.description.toLowerCase().includes(q) ||
				b.developers.some((d) => d.username.toLowerCase().includes(q)),
		);
	}, [bots, search]);

	const filteredServers = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return serverList;
		return serverList.filter(
			(s) =>
				s.name.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q) ||
				s.owner?.username.toLowerCase().includes(q),
		);
	}, [serverList, search]);

	const remove = useCallback(
		async (item: ManagedItem) => {
			if (item.kind === "bot") {
				const result = await deleteBot({ data: { id: item.id } });
				if (!result.success) {
					onError?.(result.error ?? "刪除機器人失敗");
					return false;
				}
				setBots((prev) => prev.filter((b) => b.id !== item.id));
			} else {
				const result = await deleteServer({ data: { guildId: item.id } });
				if (!result.success) {
					onError?.(result.error ?? "刪除伺服器失敗");
					return false;
				}
				setServerList((prev) => prev.filter((s) => s.id !== item.id));
			}
			return true;
		},
		[onError],
	);

	return { filteredBots, filteredServers, search, setSearch, remove } as const;
}
