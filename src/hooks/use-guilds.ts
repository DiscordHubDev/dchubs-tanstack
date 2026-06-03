import { useQuery } from "@tanstack/react-query";
import { guildMembershipQueryOptions } from "#/features/servers/add-server.query";

export function useGuilds() {
	const query = useQuery(guildMembershipQueryOptions());

	const activeGuilds = query.data?.activeGuilds ?? [];
	const inactiveGuilds = query.data?.inactiveGuilds ?? [];
	const hasGuilds = activeGuilds.length + inactiveGuilds.length > 0;

	return {
		...query,
		isLoading: query.isPending,
		activeGuilds,
		inactiveGuilds,
		hasGuilds,
	};
}

export function useGuild(serverId: string | undefined) {
	const query = useQuery({
		...guildMembershipQueryOptions(),
		// 使用 select 來從整包 data 中萃取單一伺服器
		select: (data) => {
			if (!serverId) return null;

			// 1. 先在已發布 (active) 裡面找
			const activeGuild = data.activeGuilds.find((g) => g.id === serverId);
			if (activeGuild) return activeGuild;

			// 2. 如果沒有，再從未發布 (inactive) 裡面找
			const inactiveGuild = data.inactiveGuilds.find((g) => g.id === serverId);
			return inactiveGuild ?? null;
		},
	});

	return {
		...query,
		guild: query.data, // 這裡的 data 已經被 select 轉換成單一 guild (或 null)
		isPublished: query.data?.isPublished ?? false,
		isLoading: query.isPending,
		isNotFound: !query.isPending && !query.data && !!serverId,
	};
}
