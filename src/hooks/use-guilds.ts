import { useSuspenseQuery } from "@tanstack/react-query";
import { guildMembershipQueryOptions } from "#/features/servers/add-server.query";

export function useGuilds() {
	// 1. 改用 useSuspenseQuery
	const query = useSuspenseQuery(guildMembershipQueryOptions());

	// 2. 資料絕對存在，不需要 fallback 空陣列 (?? [])
	const { activeGuilds, inactiveGuilds } = query.data;
	const hasGuilds = activeGuilds.length + inactiveGuilds.length > 0;

	return {
		...query,
		// isLoading: query.isPending, -> Suspense 模式下元件能渲染就代表載入完畢，可移除
		activeGuilds,
		inactiveGuilds,
		hasGuilds,
	};
}

export function useGuild(serverId: string | undefined) {
	const query = useSuspenseQuery({
		...guildMembershipQueryOptions(),
		select: (data) => {
			if (!serverId) return null;

			// 1. 先在已發布 (active) 裡面找
			const activeGuild = data.activeGuilds.find((g) => g.id === serverId);
			if (activeGuild) return activeGuild;

			// 2. 如果沒有，再從未發布 (inactive) 裡面找
			return data.inactiveGuilds.find((g) => g.id === serverId) ?? null;
		},
	});

	return {
		...query,
		guild: query.data,
		// 雖然原始資料絕對存在，但經過 select 後的 query.data 可能是 null，所以這裡依然需要 ?.
		isPublished: query.data?.isPublished ?? false,
		// isNotFound 邏輯變得更簡潔，不需要判斷 !query.isPending
		isNotFound: !query.data && !!serverId,
	};
}
