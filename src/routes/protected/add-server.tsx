import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiscordGuild } from "#/features/servers/add-server.types";
import { useGuilds } from "#/hooks/use-guilds";
import { checkAuthServerFn } from "#/lib/auth.functions";

export const Route = createFileRoute("/protected/add-server")({
	preload: false,
	component: RouteComponent,
	beforeLoad: async ({ location }) => {
		// 這裡會透過 RPC 呼叫後端確認 Header 狀態
		const authStatus = await checkAuthServerFn();

		if (!authStatus.isAuthenticated || !authStatus.userId) {
			// 雙重保險：Client 端跳轉時發現沒登入，強制導向登入頁
			throw redirect({
				to: "/", // 或 "/login"
				search: { redirect: location.href },
			});
		}
	},
});

const INITIAL_SERVERS_LOAD = 12;
const LOAD_MORE_AMOUNT = 8;
const DEFAULT_BOT_PERMISSIONS = "1126965059046400";

function buildGuildIconUrl(guild: DiscordGuild): string | null {
	if (!guild.icon) {
		return null;
	}

	return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function buildBotInviteUrl(input: {
	clientId: string;
	guildId: string;
	permissions: string;
}) {
	const inviteUrl = new URL("https://discord.com/oauth2/authorize");
	inviteUrl.searchParams.set("client_id", input.clientId);
	inviteUrl.searchParams.set("permissions", input.permissions);
	inviteUrl.searchParams.set("integration_type", "0");

	// 💡 關鍵改動 1：有跳轉網址時，scope 必須包含 Oauth2 範疇，單寫 "bot" 會報錯
	inviteUrl.searchParams.set("scope", "bot identify");

	inviteUrl.searchParams.set("guild_id", input.guildId);
	inviteUrl.searchParams.set("disable_guild_select", "true");

	// 💡 關鍵改動 2：加入成功後要跳轉回來的目標網址
	// 例如跳轉回目前網頁：window.location.origin + "/success" 或直接回首頁
	const redirectUri = window.location.origin + "/protected/add-server";
	inviteUrl.searchParams.set("redirect_uri", redirectUri);

	// 💡 關鍵改動 3：Discord 規定有 redirect_uri 就必須帶上 response_type
	inviteUrl.searchParams.set("response_type", "code");

	return inviteUrl.toString();
}

type GuildCardProps = {
	guild: DiscordGuild;
	actionLabel: string;
	onAction: (guildId: string) => void;
	actionClassName: string;
};

function GuildCard({
	guild,
	actionLabel,
	onAction,
	actionClassName,
}: GuildCardProps) {
	const iconUrl = buildGuildIconUrl(guild);

	return (
		<div className="flex flex-col gap-4 rounded-xl border border-[#4f545c] bg-[#2f3136] p-4">
			<div className="flex min-w-0 items-center gap-3">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#40444b] font-semibold text-[#dcddde] text-sm">
					{iconUrl ? (
						<img
							src={iconUrl}
							alt={guild.name}
							className="h-full w-full object-cover"
							loading="lazy"
						/>
					) : (
						guild.name.slice(0, 1).toUpperCase()
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-white">{guild.name}</p>
					<p className="text-[#b9bbbe] text-xs">
						{guild.owner ? "你是擁有者" : "你是管理員"}
					</p>
				</div>
			</div>

			<button
				type="button"
				onClick={() => onAction(guild.id)}
				className={actionClassName}
			>
				{actionLabel}
			</button>
		</div>
	);
}

function RouteComponent() {
	const navigate = useNavigate();
	const {
		data,
		activeGuilds,
		inactiveGuilds,
		hasGuilds,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
	} = useGuilds();

	const [activeLimit, setActiveLimit] = useState(INITIAL_SERVERS_LOAD);
	const [inactiveLimit, setInactiveLimit] = useState(INITIAL_SERVERS_LOAD);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	const visibleActive = useMemo(
		() => activeGuilds.slice(0, activeLimit),
		[activeGuilds, activeLimit],
	);

	const visibleInactive = useMemo(
		() => inactiveGuilds.slice(0, inactiveLimit),
		[inactiveGuilds, inactiveLimit],
	);

	const canLoadMoreActive = activeLimit < activeGuilds.length;
	const canLoadMoreInactive = inactiveLimit < inactiveGuilds.length;

	const handleRefresh = useCallback(() => {
		void refetch();
	}, [refetch]);

	const handlePublishServer = useCallback(
		(guildId: string) => {
			void navigate({
				to: "/servers/$serverId/publish",
				params: { serverId: guildId },
			});
		},
		[navigate],
	);

	const handleAddBot = useCallback(
		(guildId: string) => {
			const clientId = data?.botInviteClientId;
			if (!clientId) {
				return;
			}

			const inviteUrl = buildBotInviteUrl({
				clientId,
				guildId,
				permissions: data?.botInvitePermissions ?? DEFAULT_BOT_PERMISSIONS,
			});

			window.location.assign(inviteUrl);
		},
		[data?.botInviteClientId, data?.botInvitePermissions],
	);

	const handleScroll = useCallback(() => {
		if (isLoadingMore || (!canLoadMoreActive && !canLoadMoreInactive)) {
			return;
		}

		if (
			window.innerHeight + window.scrollY >=
			document.body.offsetHeight - 800
		) {
			setIsLoadingMore(true);

			window.setTimeout(() => {
				if (canLoadMoreActive) {
					setActiveLimit((previous) =>
						Math.min(previous + LOAD_MORE_AMOUNT, activeGuilds.length),
					);
				} else if (canLoadMoreInactive) {
					setInactiveLimit((previous) =>
						Math.min(previous + LOAD_MORE_AMOUNT, inactiveGuilds.length),
					);
				}

				setIsLoadingMore(false);
			}, 0);
		}
	}, [
		isLoadingMore,
		canLoadMoreActive,
		canLoadMoreInactive,
		activeGuilds.length,
		inactiveGuilds.length,
	]);

	useEffect(() => {
		if (isLoading || isError) {
			return;
		}

		let ticking = false;

		const scrollListener = () => {
			if (ticking) {
				return;
			}

			window.requestAnimationFrame(() => {
				handleScroll();
				ticking = false;
			});

			ticking = true;
		};

		window.addEventListener("scroll", scrollListener, { passive: true });
		return () => window.removeEventListener("scroll", scrollListener);
	}, [handleScroll, isLoading, isError]);

	return (
		<div className="min-h-dvh bg-[#36393f] text-white">
			<div className="container mx-auto px-4 py-8">
				<header className="mb-8">
					<div className="mb-2 flex items-center justify-between">
						<h1 className="font-bold text-3xl">擁有的伺服器</h1>
						<button
							type="button"
							onClick={handleRefresh}
							disabled={isFetching}
							className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#5865f2] px-4 py-2 transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:bg-[#4752c4] disabled:opacity-50"
							title="Refresh server list"
						>
							<RefreshCw
								className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
							/>
							<span className="font-medium text-sm">
								{isFetching ? "重新獲取中..." : "重新獲取"}
							</span>
						</button>
					</div>
					<p className="text-[#b9bbbe]">
						請選擇一個你與機器人同時存在的伺服器，以繼續進行伺服器發布
						{isFetching && (
							<span className="ml-3 text-[#5865f2]">
								• 取得最新的群組清單中...
							</span>
						)}
					</p>
				</header>

				{isLoading && (
					<div className="py-20 text-center text-[#b9bbbe]">
						<div className="inline-flex items-center gap-2">
							<RefreshCw className="h-4 w-4 animate-spin" />
							<span>加載Discord群組...</span>
						</div>
					</div>
				)}

				{isError && (
					<div className="rounded-xl border border-[#ed4245] bg-[#2f3136] p-6 text-center">
						<div className="mb-3 inline-flex items-center gap-2 text-[#ed4245]">
							<AlertTriangle className="h-5 w-5" />
							<span className="font-semibold">讀取伺服器失敗</span>
						</div>
						<p className="mb-4 text-[#b9bbbe] text-sm">
							{error instanceof Error
								? error.message
								: "一個未預期的錯誤發生了。請稍後再試。"}
						</p>
						<button
							type="button"
							onClick={handleRefresh}
							className="cursor-pointer rounded-lg bg-[#5865f2] px-4 py-2 font-medium text-sm transition-colors hover:bg-[#4752c4]"
						>
							重試
						</button>
					</div>
				)}

				{!isLoading && !isError && !hasGuilds && (
					<div className="rounded-xl border border-[#4f545c] bg-[#2f3136] p-6 text-center text-[#b9bbbe]">
						No Discord guilds were found for your account.
					</div>
				)}

				{!isLoading && !isError && hasGuilds && (
					<>
						{activeGuilds.length > 0 && (
							<div className="mb-10">
								<div className="mb-4 flex items-center gap-2">
									<div className="h-3 w-3 rounded-full bg-[#3ba55c]" />
									<h3 className="font-medium">
										機器人所在的伺服器 ({activeGuilds.length})
									</h3>
								</div>

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
									{visibleActive.map((guild) => (
										<GuildCard
											key={guild.id}
											guild={guild}
											actionLabel={
												guild.isPublished ? "編輯伺服器" : "發布伺服器"
											}
											onAction={handlePublishServer}
											actionClassName="w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-[#3ba55c] hover:bg-[#2d7d46] text-white cursor-pointer"
										/>
									))}
								</div>

								{canLoadMoreActive && (
									<div className="mt-6 text-center">
										<div className="text-[#b9bbbe] text-sm">
											往下滑已加載更多
											{isLoadingMore && " • Loading more..."}
										</div>
									</div>
								)}
							</div>
						)}

						{inactiveGuilds.length > 0 && (
							<div className="mb-6">
								<div className="mb-4 flex items-center gap-2">
									<div className="h-3 w-3 rounded-full bg-[#ed4245]" />
									<h3 className="font-medium">
										機器人未加入的伺服器 ({inactiveGuilds.length})
									</h3>
								</div>

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
									{visibleInactive.map((guild) => (
										<GuildCard
											key={guild.id}
											guild={guild}
											actionLabel="邀請機器人"
											onAction={handleAddBot}
											actionClassName="w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-[#5865f2] hover:bg-[#4752c4] text-white cursor-pointer"
										/>
									))}
								</div>

								{canLoadMoreInactive && !canLoadMoreActive && (
									<div className="mt-6 text-center">
										<div className="text-[#b9bbbe] text-sm">
											往下滑已加載更多
											{isLoadingMore && " • Loading more..."}
										</div>
									</div>
								)}
							</div>
						)}

						{!canLoadMoreActive && !canLoadMoreInactive && (
							<div className="mt-8 text-center text-[#b9bbbe]">
								✓ 已載入所有伺服器
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
