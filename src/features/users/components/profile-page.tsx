import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale/zh-TW";
import {
	Bot,
	Calendar,
	CheckCircle,
	Clock,
	Plus,
	RefreshCw,
	Settings,
	Star,
	Users,
} from "lucide-react";
import {
	type FormEvent,
	type MouseEvent,
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { FaCheck } from "react-icons/fa6";
import { toast } from "react-toastify";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import {
	createOrRegenerateApiTokenFn,
	updateUserSettingsFn,
} from "#/features/users/users.functions";
import { userProfileQueryOptions } from "#/features/users/users.query";
import type { UserDetail } from "#/features/users/users.types";
import { runEffect, tryEffectPromise } from "#/lib/effect-utils";
import { showErrorAlert } from "#/lib/error-alert";
import { queryKeys } from "#/lib/query-keys";
import { SOCIAL_PLATFORMS } from "#/lib/socal";
import type { ProfileTab } from "../profile.schemas";

type UserProfilePageProps = {
	viewedUserId: string;
	currentUserId: string | null;
	activeTab: ProfileTab;
	onTabChange: (tab: ProfileTab) => void;
};

type ServerCardData = {
	id: string;
	name: string;
	icon: string | null;
	description: string;
	tags: string[];
	members: number;
	ownerId: string;
};

type BotCardData = UserDetail["developedBots"][0];

const PROFILE_TABS: ProfileTab[] = ["servers", "bots", "favorites", "settings"];

function isProfileTab(value: string): value is ProfileTab {
	return PROFILE_TABS.includes(value as ProfileTab);
}

function showSuccessNotification(message: string) {
	toast.success(message);
}

function showErrorNotification(message: string) {
	showErrorAlert(message, "操作失敗");
}

export function UserProfilePage({
	viewedUserId,
	currentUserId,
	activeTab,
	onTabChange,
}: UserProfilePageProps) {
	const navigate = useNavigate();
	const { data: viewedUser } = useSuspenseQuery(
		userProfileQueryOptions(viewedUserId),
	);
	const isOwner = viewedUserId === currentUserId;

	const managedServers = useMemo<ServerCardData[]>(() => {
		if (!viewedUser) return [];

		const serversMap = new Map<string, ServerCardData>();
		for (const item of [...viewedUser.ownedServers, ...viewedUser.adminIn]) {
			if (serversMap.has(item.id)) continue;
			serversMap.set(item.id, {
				id: item.id,
				name: item.name,
				icon: item.icon,
				description: item.description ?? "",
				tags: item.tags ?? [],
				members: item.members ?? 0,
				ownerId: item.ownerId ?? "",
			});
		}

		return [...serversMap.values()];
	}, [viewedUser]);

	const navigationRef = useRef(false);

	const handleManageServer = useCallback(
		(serverId: string, e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (navigationRef.current) return;

			navigationRef.current = true;
			navigate({
				to: "/servers/$serverId",
				params: { serverId },
			});

			window.setTimeout(() => {
				navigationRef.current = false;
			}, 1000);
		},
		[navigate],
	);

	const handleManageBot = useCallback(
		(botId: string, e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (navigationRef.current) return;

			navigationRef.current = true;
			navigate({
				to: "/bots/$botId",
				params: { botId },
			});

			window.setTimeout(() => {
				navigationRef.current = false;
			}, 1000);
		},
		[navigate],
	);

	if (!viewedUser) {
		return (
			<div className="min-h-dvh flex items-center justify-center bg-[#2b2d31] text-white">
				<div className="text-center">
					<h2 className="text-2xl font-semibold mb-2">找不到用戶</h2>
					<p className="text-gray-400 text-sm">用戶資料不存在或已被移除。</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			<UserHeader user={viewedUser} />
			<div className="max-w-7xl mx-auto px-4 py-8">
				<Tabs
					value={activeTab}
					onValueChange={(value) => {
						if (!isProfileTab(value)) return;
						if (!isOwner && value === "settings") return;
						onTabChange(value);
					}}
					className="mb-8"
				>
					<TabsList className="bg-[#2b2d31] border-b border-[#1e1f22] w-full h-full overflow-x-auto overflow-y-auto">
						<TabsTrigger
							value="servers"
							className="data-[state=active]:bg-[#36393f]"
						>
							<Users size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的伺服器
						</TabsTrigger>
						<TabsTrigger
							value="bots"
							className="data-[state=active]:bg-[#36393f]"
						>
							<Bot size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的機器人
						</TabsTrigger>
						<TabsTrigger
							value="favorites"
							className="data-[state=active]:bg-[#36393f]"
						>
							<Star size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的收藏
						</TabsTrigger>
						{isOwner ? (
							<TabsTrigger
								value="settings"
								className="data-[state=active]:bg-[#36393f]"
							>
								<Settings size={16} className="mr-2" />
								帳號設置
							</TabsTrigger>
						) : null}
					</TabsList>

					<TabsContent value="servers" className="mt-6">
						<MemoizedServersTab
							managedServers={managedServers}
							isOwner={isOwner}
							onManageServer={handleManageServer}
						/>
					</TabsContent>

					<TabsContent value="bots" className="mt-6">
						<MemoizedBotsTab
							bots={viewedUser.developedBots}
							isOwner={isOwner}
							onManageBot={handleManageBot}
						/>
					</TabsContent>

					<TabsContent value="favorites" className="mt-6">
						<MemoizedFavoritesTab
							favoriteServers={viewedUser.favoriteServers}
							favoriteBots={viewedUser.favoriteBots}
						/>
					</TabsContent>

					{isOwner ? (
						<TabsContent value="settings" className="mt-6">
							<MemoizedSettingsContent isOwner={isOwner} user={viewedUser} />
						</TabsContent>
					) : null}
				</Tabs>
			</div>
		</div>
	);
}

const SecureAPIKeyButton = memo(({ isOwner }: { isOwner: boolean }) => {
	if (!isOwner) return null;

	return (
		<div className="mt-6 items-center">
			<div className="bg-[#2b2d31] rounded-lg p-6">
				<h2 className="text-xl font-bold mb-6">API 設置</h2>
				<div className="flex justify-center">
					<APIKeyManager />
				</div>
			</div>
		</div>
	);
});

SecureAPIKeyButton.displayName = "SecureAPIKeyButton";

function APIKeyManager() {
	const [apiKey, setApiKey] = useState<{
		accessToken: string;
		refreshToken: string;
	} | null>(null);
	const [hasToken, setHasToken] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const isRequestingRef = useRef(false);

	const mutation = useMutation({
		mutationFn: () =>
			runEffect(
				tryEffectPromise("Failed to create API key", () =>
					createOrRegenerateApiTokenFn(),
				),
			),
	});

	const handleCreateOrRegen = useCallback(async () => {
		if (isRequestingRef.current || isLoading) return;

		isRequestingRef.current = true;
		setIsLoading(true);

		try {
			const tokens = await mutation.mutateAsync();
			setApiKey(tokens);
			setHasToken(true);

			if (navigator.clipboard && window.isSecureContext) {
				window.focus();
				await navigator.clipboard.writeText(tokens.accessToken);
				showSuccessNotification("存取令牌已建立並複製到剪貼簿");
			}
		} catch {
			showErrorNotification("操作失敗，請稍後再試");
		} finally {
			setIsLoading(false);
			window.setTimeout(() => {
				isRequestingRef.current = false;
			}, 1000);
		}
	}, [isLoading, mutation]);

	return (
		<div className="flex flex-col items-center mt-4 space-y-6 w-full">
			{apiKey ? <TokenDisplaySection tokens={apiKey} /> : null}

			<Button
				className="bg-discord hover:bg-discord-hover text-white cursor-pointer disabled:opacity-50"
				onClick={handleCreateOrRegen}
				disabled={isLoading || isRequestingRef.current}
			>
				{isLoading ? (
					<>載入中...</>
				) : apiKey || hasToken ? (
					<>
						<RefreshCw size={16} className="mr-2" />
						重新建立 API Key
					</>
				) : (
					<>
						<Plus size={16} className="mr-2" />
						建立 API Key
					</>
				)}
			</Button>
		</div>
	);
}

const TokenDisplaySection = memo(
	({ tokens }: { tokens: { accessToken: string; refreshToken: string } }) => (
		<div className="space-y-4 w-full">
			<div className="text-yellow-200 rounded-md text-xl p-4 bg-yellow-900/20 border border-yellow-700">
				注意：此 API Key 僅會顯示一次，請妥善保存。
			</div>
			<SecureTokenDisplay label="存取令牌" token={tokens.accessToken} />
			<SecureTokenDisplay label="重整令牌" token={tokens.refreshToken} />
		</div>
	),
);

TokenDisplaySection.displayName = "TokenDisplaySection";

const SecureTokenDisplay = memo(
	({ label, token }: { label: string; token: string }) => {
		const [copied, setCopied] = useState(false);
		const copyingRef = useRef(false);

		const handleCopy = useCallback(async () => {
			if (copyingRef.current) return;

			if (!navigator.clipboard || !window.isSecureContext) {
				showErrorNotification("無法複製：不支援剪貼簿功能");
				return;
			}

			copyingRef.current = true;

			try {
				await navigator.clipboard.writeText(token);
				setCopied(true);
				showSuccessNotification(`${label} 已複製成功！`);

				// 重置複製狀態
				setTimeout(() => {
					setCopied(false);
					copyingRef.current = false;
				}, 2000);
			} catch (error) {
				showErrorNotification(
					`複製失敗：${error instanceof Error ? error.message : "未知錯誤"}`,
				);
				copyingRef.current = false;
			}
		}, [token, label]);

		return (
			<div>
				<p className="text-gray-200 mb-2">{label}：</p>
				<button
					type="button"
					className={`p-3 rounded-md font-mono text-sm break-all cursor-pointer transition-colors ${
						copied
							? "bg-green-800 text-green-100"
							: "bg-gray-800 text-gray-100 hover:bg-gray-700"
					}`}
					onClick={() => void handleCopy()}
					title={`${label} 複製`}
				>
					{token}
				</button>
			</div>
		);
	},
);

SecureTokenDisplay.displayName = "SecureTokenDisplay";

const ServersTab = memo(
	({
		managedServers,
		isOwner,
		onManageServer,
	}: {
		managedServers: ServerCardData[];
		isOwner: boolean;
		onManageServer: (id: string, e: MouseEvent) => void;
	}) => (
		<div className="mt-6">
			<div className="flex justify-between items-center mb-4">
				<h2 className="text-2xl font-bold">{isOwner ? "我" : "他"}的伺服器</h2>
				{isOwner ? (
					<Link to="/add-server">
						<Button className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
							<Plus size={16} />
							新增伺服器
						</Button>
					</Link>
				) : null}
			</div>

			{managedServers.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{managedServers.map((server) => (
						<ServerCard
							key={server.id}
							server={server}
							isOwner={isOwner}
							onManageServer={onManageServer}
						/>
					))}
				</div>
			) : (
				<EmptyState
					message={`${isOwner ? "你" : "他"}尚未建立任何伺服器`}
					actionButton={
						isOwner ? (
							<Link to="/add-server">
								<Button className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
									<Plus size={16} />
									新增伺服器
								</Button>
							</Link>
						) : null
					}
				/>
			)}
		</div>
	),
);

ServersTab.displayName = "ServersTab";

const ServerCard = memo(
	({
		server,
		isOwner,
		onManageServer,
	}: {
		server: ServerCardData;
		isOwner: boolean;
		onManageServer: (id: string, e: MouseEvent) => void;
	}) => {
		const clickingRef = useRef(false);

		const handleManageClick = useCallback(
			(e: MouseEvent) => {
				if (clickingRef.current) return;
				clickingRef.current = true;
				onManageServer(server.id, e);
				window.setTimeout(() => {
					clickingRef.current = false;
				}, 1000);
			},
			[onManageServer, server.id],
		);

		return (
			<Card className="bg-[#2b2d31] border-[#1e1f22] hover:border-[#5865f2] transition-all duration-200 flex flex-col h-full">
				<Link
					to="/servers/$serverId"
					params={{ serverId: server.id }}
					className="block"
				>
					<CardHeader className="pb-2">
						<div className="flex items-center space-x-3">
							<div className="w-10 h-10 rounded-full bg-[#36393f] overflow-hidden">
								<img
									src={server.icon || "/placeholder.png?height=40&width=40"}
									alt={server.name}
									className="w-full h-full object-cover"
									loading="lazy"
								/>
							</div>
							<div>
								<CardTitle className="text-white truncate w-full">
									{server.name}
								</CardTitle>
								<CardDescription className="text-gray-400">
									{server.members.toLocaleString()} 成員
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pb-2">
						<p className="text-gray-300 text-sm line-clamp-2">
							{server.description}
						</p>
						<div className="flex flex-wrap gap-2 mt-2">
							{server.tags.slice(0, 3).map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="cursor-default bg-[#36393f] text-gray-300 hover:bg-[#4f545c]"
								>
									{tag}
								</Badge>
							))}
						</div>
					</CardContent>
				</Link>

				{isOwner ? (
					<CardFooter className="mt-auto flex flex-col gap-3">
						<Button
							variant="outline"
							size="sm"
							onClick={handleManageClick}
							className="w-full border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2] cursor-pointer h-10"
						>
							管理伺服器
						</Button>
						<PinActionButton itemName={server.name} />
					</CardFooter>
				) : null}
			</Card>
		);
	},
);

ServerCard.displayName = "ServerCard";

const BotsTab = memo(
	({
		bots,
		isOwner,
		onManageBot,
	}: {
		bots: UserDetail["developedBots"];
		isOwner: boolean;
		onManageBot: (id: string, e: MouseEvent) => void;
	}) => {
		const approvedBots = useMemo(
			() => bots.filter((bot) => bot.status !== "rejected"),
			[bots],
		);

		return (
			<div className="mt-6">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-2xl font-bold">
						{isOwner ? "我" : "他"}的機器人
					</h2>
					{isOwner ? (
						<Link to="/add-bot">
							<Button className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
								<Plus size={16} />
								新增機器人
							</Button>
						</Link>
					) : null}
				</div>

				{approvedBots.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{approvedBots.map((bot) => (
							<BotCard
								key={bot.id}
								bot={bot}
								isOwner={isOwner}
								onManageBot={onManageBot}
							/>
						))}
					</div>
				) : (
					<EmptyState
						message={`${isOwner ? "你" : "他"}尚未建立任何機器人`}
						actionButton={
							isOwner ? (
								<Link to="/add-bot">
									<Button className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
										<Plus size={16} />
										新增機器人
									</Button>
								</Link>
							) : null
						}
					/>
				)}
			</div>
		);
	},
);

BotsTab.displayName = "BotsTab";

const BotCard = memo(
	({
		bot,
		isOwner,
		onManageBot,
	}: {
		bot: BotCardData;
		isOwner: boolean;
		onManageBot: (id: string, e: MouseEvent) => void;
	}) => {
		const clickingRef = useRef(false);

		const handleManageClick = useCallback(
			(e: MouseEvent) => {
				if (clickingRef.current) return;
				clickingRef.current = true;
				onManageBot(bot.id, e);
				window.setTimeout(() => {
					clickingRef.current = false;
				}, 1000);
			},
			[bot.id, onManageBot],
		);

		return (
			<Card className="bg-[#2b2d31] border-[#1e1f22] hover:border-[#5865f2] transition-all duration-200 flex flex-col h-full">
				<Link to="/bots/$botId" params={{ botId: bot.id }} className="block">
					<CardHeader className="pb-2">
						<div className="flex items-center space-x-3">
							<div className="w-10 h-10 rounded-full bg-[#36393f] overflow-hidden">
								<img
									src={bot.icon || "/placeholder.png?height=40&width=40"}
									alt={bot.name}
									className="w-full h-full object-cover"
									loading="lazy"
								/>
							</div>
							<div className="flex items-center gap-2">
								<CardTitle className="text-white truncate">
									{bot.name}
								</CardTitle>
								{bot.verified && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge className="5865F2 text-white text-sm px-3 rounded-full gap-1 inline-flex items-center cursor-default bg-discord hover:bg-discord-hover hover:text-white">
													<FaCheck className="w-3.5 h-3.5" />
													驗證
												</Badge>
											</TooltipTrigger>
											<TooltipContent>已驗證的 Discord 機器人</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								)}
							</div>
						</div>
					</CardHeader>
					<CardContent className="pb-2">
						<p className="text-gray-300 text-sm line-clamp-2">
							{bot.description ?? ""}
						</p>
						<div className="flex flex-wrap gap-2 mt-2">
							{(bot.tags ?? []).slice(0, 3).map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="bg-[#36393f] text-gray-300 text-xs"
								>
									{tag}
								</Badge>
							))}
						</div>
						<div className="flex items-center text-sm text-gray-400 mt-2">
							<Users size={14} className="mr-1" />
							<span>{(bot.servers ?? 0).toLocaleString()} 伺服器</span>
						</div>
						<BotStatusIndicator status={bot.status ?? "pending"} />
					</CardContent>
				</Link>

				{isOwner ? (
					<CardFooter className="mt-auto flex flex-col gap-3">
						<Button
							variant="outline"
							size="sm"
							onClick={handleManageClick}
							className="w-full border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2] cursor-pointer h-10"
						>
							管理機器人
						</Button>
						<PinActionButton itemName={bot.name} />
					</CardFooter>
				) : null}
			</Card>
		);
	},
);

BotCard.displayName = "BotCard";

const BotStatusIndicator = memo(({ status }: { status: string }) => {
	switch (status) {
		case "pending":
			return (
				<div className="flex items-center text-sm text-yellow-500 mt-2">
					<Clock size={14} className="mr-1" />
					<span>機器人仍在審核中</span>
				</div>
			);
		case "approved":
			return (
				<div className="flex items-center text-sm text-green-500 mt-2">
					<CheckCircle size={14} className="mr-1" />
					<span>機器人已通過審核</span>
				</div>
			);
		default:
			return null;
	}
});

BotStatusIndicator.displayName = "BotStatusIndicator";

const FavoritesTab = memo(
	({
		favoriteServers,
		favoriteBots,
	}: {
		favoriteServers: UserDetail["favoriteServers"];
		favoriteBots: UserDetail["favoriteBots"];
	}) => (
		<div className="mt-6 space-y-8">
			<FavoriteServersSection servers={favoriteServers} />
			<FavoriteBotsSection bots={favoriteBots} />
		</div>
	),
);

FavoritesTab.displayName = "FavoritesTab";

const FavoriteServersSection = memo(
	({ servers }: { servers: UserDetail["favoriteServers"] }) => (
		<div>
			<h2 className="text-2xl font-bold mb-4">收藏的伺服器</h2>
			{servers.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{servers.map((server) => (
						<FavoriteServerCard key={server.id} server={server} />
					))}
				</div>
			) : (
				<EmptyState message="沒有收藏的伺服器" />
			)}
		</div>
	),
);

FavoriteServersSection.displayName = "FavoriteServersSection";

const FavoriteBotsSection = memo(
	({ bots }: { bots: UserDetail["favoriteBots"] }) => (
		<div>
			<h2 className="text-2xl font-bold mb-4">收藏的機器人</h2>
			{bots.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{bots.map((bot) => (
						<FavoriteBotCard key={bot.id} bot={bot} />
					))}
				</div>
			) : (
				<EmptyState message="沒有收藏的機器人" />
			)}
		</div>
	),
);

FavoriteBotsSection.displayName = "FavoriteBotsSection";

const FavoriteServerCard = memo(
	({ server }: { server: UserDetail["favoriteServers"][0] }) => (
		<Link
			to="/servers/$serverId"
			params={{ serverId: server.id }}
			className="block"
		>
			<Card className="bg-[#2b2d31] border-[#1e1f22] hover:border-[#5865f2] transition-all duration-200">
				<CardHeader className="pb-2">
					<div className="flex items-center space-x-3">
						<div className="w-10 h-10 rounded-full bg-[#36393f] overflow-hidden">
							<img
								src={server.icon || "/placeholder.png?height=40&width=40"}
								alt={server.name}
								className="w-full h-full object-cover"
								loading="lazy"
							/>
						</div>
						<div>
							<CardTitle className="text-white truncate">
								{server.name}
							</CardTitle>
							<CardDescription className="text-gray-400 mt-1">
								{(server.members ?? 0).toLocaleString()} 成員
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-gray-300 text-sm line-clamp-2">
						{server.description ?? ""}
					</p>
				</CardContent>
			</Card>
		</Link>
	),
);

FavoriteServerCard.displayName = "FavoriteServerCard";

const FavoriteBotCard = memo(
	({ bot }: { bot: UserDetail["favoriteBots"][0] }) => (
		<Link to="/bots/$botId" params={{ botId: bot.id }} className="block">
			<Card className="bg-[#2b2d31] border-[#1e1f22] hover:border-[#5865f2] transition-all duration-200">
				<CardHeader className="pb-2">
					<div className="flex items-center space-x-3">
						<div className="w-10 h-10 rounded-full bg-[#36393f] overflow-hidden">
							<img
								src={bot.icon || "/placeholder.png?height=40&width=40"}
								alt={bot.name}
								className="w-full h-full object-cover"
								loading="lazy"
							/>
						</div>
						<div className="flex items-center gap-2">
							<CardTitle className="text-white truncate">{bot.name}</CardTitle>
							{bot.verified && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Badge className="5865F2 text-white text-sm px-3 rounded-full gap-1 inline-flex items-center cursor-default bg-discord hover:bg-discord-hover hover:text-white">
												<FaCheck className="w-3.5 h-3.5" />
												驗證
											</Badge>
										</TooltipTrigger>
										<TooltipContent>已驗證的 Discord 機器人</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-gray-300 text-sm line-clamp-2">
						{bot.description ?? ""}
					</p>
				</CardContent>
			</Card>
		</Link>
	),
);

FavoriteBotCard.displayName = "FavoriteBotCard";

const SettingsTab = memo(({ user }: { user: UserDetail }) => (
	<div className="mt-6">
		<div className="bg-[#2b2d31] rounded-lg p-6">
			<h2 className="text-xl font-bold mb-6">帳號設置</h2>
			<UserSettingsForm user={user} />
		</div>
	</div>
));

SettingsTab.displayName = "SettingsTab";

const EmptyState = memo(
	({
		message,
		actionButton,
	}: {
		message: string;
		actionButton?: ReactNode;
	}) => (
		<div className="bg-[#2b2d31] rounded-lg p-8 text-center">
			<p className="text-gray-300">{message}</p>
			{actionButton}
		</div>
	),
);

EmptyState.displayName = "EmptyState";

const UserHeader = memo(({ user }: { user: UserDetail }) => {
	return (
		<div>
			{/* Banner */}
			<div className="h-90 bg-[#36393f] relative overflow-hidden">
				{user.banner ? (
					<div className="relative w-full h-full overflow-hidden">
						<div
							className="absolute inset-0 bg-center bg-cover"
							style={{ backgroundImage: `url(${user.banner})` }}
						></div>
					</div>
				) : user.bannerColor ? (
					<div
						className="w-full h-full"
						style={{ backgroundColor: user.bannerColor }}
					></div>
				) : (
					<div className="w-full h-full bg-linear-to-r from-[#5865f2] to-[#8c54ff]"></div>
				)}
			</div>

			{/* User Info */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-13 relative z-10">
				<div className="flex flex-col md:flex-row items-start md:items-end gap-4">
					<Avatar className="w-32 h-32 border-4 border-[#1e1f22] bg-[#36393f]">
						<AvatarImage
							src={user.avatar}
							alt={user.username}
							className="object-cover w-full h-full"
						/>
						<AvatarFallback
							className="text-3xl bg-[#5865f2]"
							suppressHydrationWarning
						>
							{user.username}
						</AvatarFallback>
					</Avatar>

					<div className="flex flex-col">
						<h1 className="text-2xl md:text-3xl font-bold text-white">
							{user.username}
						</h1>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-300 mt-2">
							<div className="flex items-center">
								<Calendar size={16} className="mr-1" />
								<span>
									加入於{" "}
									{formatDistanceToNow(new Date(user.joinedAt), {
										addSuffix: true,
										locale: zhTW,
									})}
								</span>
							</div>
						</div>
					</div>
				</div>

				{/* Bio */}
				{user.bio && (
					<div className="mt-6 bg-[#2b2d31] rounded-lg p-4">
						<p className="text-gray-300">{user.bio}</p>
					</div>
				)}

				{user.social && Object.entries(user.social).some(([, val]) => val) && (
					<div className="mt-6 flex flex-wrap gap-4">
						{Object.entries(user.social).map(([platform, value]) => {
							if (!value) return null;
							const config = SOCIAL_PLATFORMS[platform];
							if (!config) return null;

							const Icon = config.icon;
							const link = config.link ? config.link(value) : "#";

							return (
								<a
									key={platform}
									href={link}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 px-4 py-2 bg-[#2b2d31] hover:bg-[#36393f] text-gray-300 hover:text-white rounded-md transition-colors"
								>
									<Icon size={16} />
									<span className="truncate max-w-37.5">{value}</span>
								</a>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
});

UserHeader.displayName = "UserHeader";

const PinActionButton = memo(({ itemName }: { itemName: string }) => (
	<Button
		variant="outline"
		className="w-full border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2] cursor-pointer h-10"
		onClick={() =>
			showSuccessNotification(`${itemName} 的置頂設定已保留舊版樣式`)
		}
	>
		置頂設定
	</Button>
));

PinActionButton.displayName = "PinActionButton";

const UserSettingsForm = memo(({ user }: { user: UserDetail }) => {
	const queryClient = useQueryClient();
	const [bio, setBio] = useState(user.bio ?? "");
	const [website, setWebsite] = useState(user.social.website ?? "");
	const [github, setGithub] = useState(user.social.github ?? "");
	const [discord, setDiscord] = useState(user.social.discord ?? "");

	useEffect(() => {
		setBio(user.bio ?? "");
		setWebsite(user.social.website ?? "");
		setGithub(user.social.github ?? "");
		setDiscord(user.social.discord ?? "");
	}, [user]);

	const mutation = useMutation({
		mutationFn: (input: { bio: string; social: Record<string, string> }) =>
			runEffect(
				tryEffectPromise("Failed to update user settings", () =>
					updateUserSettingsFn({ data: input }),
				),
			),
		onSuccess: async (result) => {
			if (result.error) {
				showErrorNotification(result.error);
				return;
			}

			showSuccessNotification(result.success ?? "已成功儲存");
			await queryClient.invalidateQueries({
				queryKey: queryKeys.users.detail(user.id),
			});
			await queryClient.invalidateQueries({
				queryKey: queryKeys.users.current(),
			});
		},
		onError: () => {
			showErrorNotification("儲存失敗");
		},
	});

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const social = {
				website: website.trim(),
				github: github.trim(),
				discord: discord.trim(),
			};
			mutation.mutate({
				bio,
				social,
			});
		},
		[bio, discord, github, mutation, website],
	);

	const socialEntries = Object.entries(SOCIAL_PLATFORMS);
	const socialData = user.social as Record<string, string>;

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="space-y-2">
						<label className="text-sm font-medium text-gray-300">
							用戶名
							<input
								type="text"
								value={user.username}
								disabled
								className="w-full px-3 py-2 bg-[#36393f] border border-[#1e1f22] rounded-md text-white opacity-50 cursor-not-allowed"
							/>
						</label>
					</div>

					<div className="space-y-2"></div>

					<div className="md:col-span-2 space-y-2">
						<label className="text-sm font-medium text-gray-300">
							個人簡介
							<textarea
								name="bio"
								defaultValue={user.bio ?? ""}
								rows={4}
								className="w-full px-3 py-2 bg-[#36393f] border border-[#1e1f22] rounded-md text-white"
							/>
						</label>
					</div>
				</div>

				<div className="space-y-4">
					<h3 className="text-xl font-bold mb-6">社交連結</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						{socialEntries.map(([platform, config]) => (
							<div key={platform} className="space-y-2">
								<label className="text-sm font-medium text-gray-300">
									{config.name}
									<input
										type="text"
										name={`social.${platform}`}
										defaultValue={socialData?.[platform] || ""}
										className="w-full px-3 py-2 bg-[#36393f] border border-[#1e1f22] rounded-md text-white"
									/>
								</label>
							</div>
						))}
					</div>

					<div className="flex justify-end mt-4">
						<Button
							type="submit"
							className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
						>
							保存更改
						</Button>
					</div>
				</div>
			</div>
		</form>
	);
});

UserSettingsForm.displayName = "UserSettingsForm";

const MemoizedServersTab = memo(ServersTab);
const MemoizedBotsTab = memo(BotsTab);
const MemoizedFavoritesTab = memo(FavoritesTab);

const MemoizedSettingsContent = memo(
	({ isOwner, user }: { isOwner: boolean; user: UserDetail }) => (
		<>
			<SecureAPIKeyButton isOwner={isOwner} />
			<SettingsTab user={user} />
		</>
	),
);
