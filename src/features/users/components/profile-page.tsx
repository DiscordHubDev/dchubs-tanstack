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
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { FaCheck } from "react-icons/fa6";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
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
import { deleteBotFn } from "#/features/bots/bots.functions";
import { deleteServerFn } from "#/features/servers/servers.functions";
import {
	createOrRegenerateApiTokenFn,
	updateUserSettingsFn,
} from "#/features/users/users.functions";
// 假設你已經將 API 拆分為以下 Query Options 來支援懶載入
import {
	userBaseProfileQueryOptions,
	userBotsQueryOptions,
	userFavoritesQueryOptions,
	userServersQueryOptions,
	userSettingsQueryOptions,
} from "#/features/users/users.query";
import type {
	UserBaseProfile,
	UserDetail,
	UserSettings,
} from "#/features/users/users.types";
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

// 共用的載入骨架/提示
const TabLoader = () => (
	<div className="mt-8 text-center text-gray-400">載入中...</div>
);

export function UserProfilePage({
	viewedUserId,
	currentUserId,
	activeTab,
	onTabChange,
}: UserProfilePageProps) {
	const navigate = useNavigate();

	// 頂層只載入 Header 必須的基礎資料
	const { data: viewedUser } = useSuspenseQuery(
		userBaseProfileQueryOptions(viewedUserId),
	);
	const queryClient = useQueryClient();
	const isOwner = viewedUserId === currentUserId;
	const navigationRef = useRef(false);

	const prefetchTimeoutRef = useRef<number | null>(null);
	const handlePrefetch = useCallback(
		(tab: ProfileTab) => {
			if (prefetchTimeoutRef.current) {
				window.clearTimeout(prefetchTimeoutRef.current);
			}

			prefetchTimeoutRef.current = window.setTimeout(() => {
				// 🛡️ 內部輔助函式：將重複的檢查與 prefetch 邏輯抽離，並保持泛型安全
				const ensurePrefetch = <
					TQueryFnData,
					TError,
					TData,
					TQueryKey extends readonly unknown[],
				>(
					options: import("@tanstack/react-query").FetchQueryOptions<
						TQueryFnData,
						TError,
						TData,
						TQueryKey
					>,
				) => {
					const queryState = queryClient.getQueryState(options.queryKey);
					// 如果已經有資料且目前沒有在背景抓取，就跳過
					if (queryState?.data && queryState.fetchStatus !== "fetching") {
						return;
					}
					queryClient.prefetchQuery(options);
				};

				// 在各自的 case 裡直接執行，TypeScript 就能完美推斷，不會產生聯集衝突
				switch (tab) {
					case "servers":
						ensurePrefetch(userServersQueryOptions(viewedUserId));
						break;
					case "bots":
						ensurePrefetch(userBotsQueryOptions(viewedUserId));
						break;
					case "favorites":
						ensurePrefetch(userFavoritesQueryOptions(viewedUserId));
						break;
					case "settings":
						if (isOwner) {
							ensurePrefetch(userSettingsQueryOptions(viewedUserId));
						}
						break;
				}
			}, 150);
		},
		[queryClient, viewedUserId, isOwner],
	);

	// 記得在元件卸載時清除 Timeout，避免 memory leak
	useEffect(() => {
		return () => {
			if (prefetchTimeoutRef.current) {
				window.clearTimeout(prefetchTimeoutRef.current);
			}
		};
	}, []);

	const handleManageServer = useCallback(
		(serverId: string, e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (navigationRef.current) return;

			navigationRef.current = true;
			navigate({
				to: "/servers/$serverId/publish",
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
				to: "/protected/bots/$botId/edit",
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
			<div className="flex min-h-dvh items-center justify-center bg-[#2b2d31] text-white">
				<div className="text-center">
					<h2 className="mb-2 font-semibold text-2xl">找不到用戶</h2>
					<p className="text-gray-400 text-sm">用戶資料不存在或已被移除。</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-[#1e1f22] text-white">
			<UserHeader user={viewedUser} />
			<div className="mx-auto max-w-7xl px-4 py-8">
				<Tabs
					value={activeTab}
					onValueChange={(value) => {
						if (!isProfileTab(value)) return;
						if (!isOwner && value === "settings") return;
						onTabChange(value);
					}}
					className="mb-8"
				>
					<TabsList className="h-full w-full overflow-hidden overflow-y-hidden border-[#1e1f22] border-b bg-[#2b2d31]">
						<TabsTrigger
							value="servers"
							className="data-[state=active]:bg-[#36393f]"
							onMouseEnter={() => handlePrefetch("servers")} // 滑鼠移入時預載
							onFocus={() => handlePrefetch("servers")}
						>
							<Users size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的伺服器
						</TabsTrigger>
						<TabsTrigger
							value="bots"
							className="data-[state=active]:bg-[#36393f]"
							onMouseEnter={() => handlePrefetch("bots")}
							onFocus={() => handlePrefetch("bots")}
						>
							<Bot size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的機器人
						</TabsTrigger>
						<TabsTrigger
							value="favorites"
							className="data-[state=active]:bg-[#36393f]"
							onMouseEnter={() => handlePrefetch("favorites")}
							onFocus={() => handlePrefetch("favorites")}
						>
							<Star size={16} className="mr-2" />
							{isOwner ? "我" : "他"}的收藏
						</TabsTrigger>
						{isOwner && (
							<TabsTrigger
								value="settings"
								className="data-[state=active]:bg-[#36393f]"
								onMouseEnter={() => handlePrefetch("settings")}
								onFocus={() => handlePrefetch("settings")}
							>
								<Settings size={16} className="mr-2" />
								帳號設置
							</TabsTrigger>
						)}
					</TabsList>

					{/* 透過 activeTab 條件判斷與 Suspense 達成 Tab 切換時才請求 API */}
					<TabsContent value="servers" className="mt-6">
						{activeTab === "servers" && (
							<Suspense fallback={<TabLoader />}>
								<ServersTabContainer
									userId={viewedUserId}
									isOwner={isOwner}
									onManageServer={handleManageServer}
								/>
							</Suspense>
						)}
					</TabsContent>

					<TabsContent value="bots" className="mt-6">
						{activeTab === "bots" && (
							<Suspense fallback={<TabLoader />}>
								<BotsTabContainer
									userId={viewedUserId}
									isOwner={isOwner}
									onManageBot={handleManageBot}
								/>
							</Suspense>
						)}
					</TabsContent>

					<TabsContent value="favorites" className="mt-6">
						{activeTab === "favorites" && (
							<Suspense fallback={<TabLoader />}>
								<FavoritesTabContainer userId={viewedUserId} />
							</Suspense>
						)}
					</TabsContent>

					{isOwner && (
						<TabsContent value="settings" className="mt-6">
							{activeTab === "settings" && (
								<Suspense fallback={<TabLoader />}>
									<SettingsTabContainer
										userId={viewedUserId}
										isOwner={isOwner}
									/>
								</Suspense>
							)}
						</TabsContent>
					)}
				</Tabs>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/* Containers: 負責該 Tab 專屬資料的抓取                                        */
/* -------------------------------------------------------------------------- */

function ServersTabContainer({
	userId,
	isOwner,
	onManageServer,
}: {
	userId: string;
	isOwner: boolean;
	onManageServer: (id: string, e: MouseEvent) => void;
}) {
	const { data } = useSuspenseQuery(userServersQueryOptions(userId));

	const managedServers = useMemo<ServerCardData[]>(() => {
		const serversMap = new Map<string, ServerCardData>();
		for (const item of [...data.owned, ...data.adminIn]) {
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
	}, [data]);

	return (
		<ServersTab
			managedServers={managedServers}
			isOwner={isOwner}
			onManageServer={onManageServer}
			userId={userId}
		/>
	);
}

function BotsTabContainer({
	userId,
	isOwner,
	onManageBot,
}: {
	userId: string;
	isOwner: boolean;
	onManageBot: (id: string, e: MouseEvent) => void;
}) {
	const { data } = useSuspenseQuery(userBotsQueryOptions(userId));
	return (
		<BotsTab
			bots={data.developedBots}
			isOwner={isOwner}
			onManageBot={onManageBot}
			userId={userId}
		/>
	);
}

function FavoritesTabContainer({ userId }: { userId: string }) {
	const { data } = useSuspenseQuery(userFavoritesQueryOptions(userId));
	return (
		<FavoritesTab
			favoriteServers={data.favoriteServers}
			favoriteBots={data.favoriteBots}
		/>
	);
}

function SettingsTabContainer({
	userId,
	isOwner,
}: {
	userId: string;
	isOwner: boolean;
}) {
	const { data: user } = useSuspenseQuery(userSettingsQueryOptions(userId));
	return (
		<>
			<SecureAPIKeyButton isOwner={isOwner} />
			<div className="mt-6">
				<div className="rounded-lg bg-[#2b2d31] p-6">
					<h2 className="mb-6 font-bold text-xl">帳號設置</h2>
					<UserSettingsForm user={user} />
				</div>
			</div>
		</>
	);
}

/* -------------------------------------------------------------------------- */
/* UI Components                                                              */
/* -------------------------------------------------------------------------- */

const SecureAPIKeyButton = memo(({ isOwner }: { isOwner: boolean }) => {
	if (!isOwner) return null;
	return (
		<div className="mt-6 items-center">
			<div className="rounded-lg bg-[#2b2d31] p-6">
				<h2 className="mb-6 font-bold text-xl">API 設置</h2>
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
				tryEffectPromise(
					"Failed to create API key",
					createOrRegenerateApiTokenFn,
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
		<div className="mt-4 flex w-full flex-col items-center space-y-6">
			{apiKey ? <TokenDisplaySection tokens={apiKey} /> : null}
			<Button
				className="cursor-pointer bg-discord text-white hover:bg-discord-hover disabled:opacity-50"
				onClick={() => void handleCreateOrRegen()}
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
		<div className="w-full space-y-4">
			<div className="rounded-md border border-yellow-700 bg-yellow-900/20 p-4 text-xl text-yellow-200">
				注意：此 API Key 僅會顯示一次，請妥善保存。
			</div>
			<SecureTokenDisplay label="存取令牌" token={tokens.accessToken} />
			<SecureTokenDisplay label="重整令牌" token={tokens.refreshToken} />
		</div>
	),
);
TokenDisplaySection.displayName = "TokenDisplaySection";

function SecureTokenDisplay({
	label,
	token,
}: {
	label: string;
	token: string;
}) {
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
			<p className="mb-2 text-gray-200">{label}：</p>
			<button
				type="button"
				className={`cursor-pointer break-all rounded-md p-3 font-mono text-sm transition-colors ${
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
}

// 移除了不必要的 memo，因為此元件完全依賴上層數據傳入，渲染開銷極小
function ServersTab({
	managedServers,
	isOwner,
	onManageServer,
	userId,
}: {
	managedServers: ServerCardData[];
	isOwner: boolean;
	onManageServer: (id: string, e: MouseEvent) => void;
	userId: string;
}) {
	return (
		<div className="mt-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-bold text-2xl">{isOwner ? "我" : "他"}的伺服器</h2>
				{isOwner && (
					<Link to="/protected/add-server">
						<Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
							<Plus size={16} />
							新增伺服器
						</Button>
					</Link>
				)}
			</div>

			{managedServers.length > 0 ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{managedServers.map((server) => (
						<ServerCard
							key={server.id}
							server={server}
							isOwner={isOwner}
							onManageServer={onManageServer}
							userId={userId}
						/>
					))}
				</div>
			) : (
				<EmptyState
					message={`${isOwner ? "你" : "他"}尚未建立任何伺服器`}
					actionButton={
						isOwner ? (
							<Link to="/protected/add-server">
								<Button className="mt-5 bg-[#5865f2] text-white hover:bg-[#4752c4]">
									<Plus size={16} />
									新增伺服器
								</Button>
							</Link>
						) : null
					}
				/>
			)}
		</div>
	);
}

const ServerCard = memo(
	({
		server,
		isOwner,
		onManageServer,
		userId,
	}: {
		server: ServerCardData;
		isOwner: boolean;
		onManageServer: (id: string, e: MouseEvent) => void;
		userId: string;
	}) => {
		const queryClient = useQueryClient();
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

		const handleDeleteServer = async () => {
			// 彈出 SweetAlert2 確認視窗
			const result = await Swal.fire({
				title: "確定要刪除伺服器嗎？",
				text: `此操作無法復原，將會永久刪除 "${server.name}"。`,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#d33", // 刪除通常用紅色
				cancelButtonColor: "#3085d6",
				confirmButtonText: "確定刪除",
				cancelButtonText: "取消",
				background: "#1e1f22", // 可以配合你的暗色系/Discord風格
				color: "#fff",
			});

			// 如果使用者點擊了確定
			if (result.isConfirmed) {
				try {
					await deleteServerFn({ data: { serverId: server.id } });

					await queryClient.invalidateQueries({
						queryKey: queryKeys.users.settings(userId),
					});

					Swal.fire({
						title: "已刪除！",
						text: "伺服器已成功移除。",
						icon: "success",
						background: "#1e1f22",
						color: "#fff",
					});
				} catch (error) {
					Swal.fire({
						title: "錯誤！",
						text: "刪除失敗，請稍後再試。",
						icon: "error",
						background: "#1e1f22",
						color: "#fff",
					});
				}
			}
		};

		return (
			<Card className="flex h-full flex-col border-[#1e1f22] bg-[#2b2d31] transition-all duration-200 hover:border-[#5865f2]">
				<Link
					to="/servers/$serverId"
					params={{ serverId: server.id }}
					className="block"
				>
					<CardHeader className="pb-2">
						<div className="flex items-center space-x-3">
							<div className="h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
								<img
									src={server.icon || "/placeholder.png?height=40&width=40"}
									alt={server.name}
									className="h-full w-full object-cover"
									loading="lazy"
								/>
							</div>
							<div>
								<CardTitle className="w-full truncate text-white">
									{server.name}
								</CardTitle>
								<CardDescription className="text-gray-400">
									{server.members.toLocaleString()} 成員
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pb-2">
						<p className="line-clamp-2 text-gray-300 text-sm">
							{server.description}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
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

				{isOwner && (
					<CardFooter className="mt-auto flex flex-col gap-3">
						<Button
							variant="outline"
							size="sm"
							onClick={handleManageClick}
							className="h-10 w-full cursor-pointer border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2]"
						>
							管理伺服器
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleDeleteServer} /* 綁定剛剛建立的刪除確認函數 */
							className="h-10 w-full cursor-pointer border-red-500 text-red-500 hover:bg-red-500 hover:text-red-800 transition-colors"
						>
							刪除伺服器
						</Button>
						<PinActionButton itemName={server.name} />
					</CardFooter>
				)}
			</Card>
		);
	},
);
ServerCard.displayName = "ServerCard";

function BotsTab({
	bots,
	isOwner,
	onManageBot,
	userId,
}: {
	bots: UserDetail["developedBots"];
	isOwner: boolean;
	onManageBot: (id: string, e: MouseEvent) => void;
	userId: string;
}) {
	const approvedBots = useMemo(
		() => bots.filter((bot) => bot.status !== "rejected"),
		[bots],
	);

	return (
		<div className="mt-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-bold text-2xl">{isOwner ? "我" : "他"}的機器人</h2>
				{isOwner && (
					<Link to="/protected/add-bot">
						<Button className="bg-[#5865f2] text-white hover:bg-[#4752c4]">
							<Plus size={16} />
							新增機器人
						</Button>
					</Link>
				)}
			</div>

			{approvedBots.length > 0 ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{approvedBots.map((bot) => (
						<BotCard
							key={bot.id}
							bot={bot}
							isOwner={isOwner}
							onManageBot={onManageBot}
							userId={userId}
						/>
					))}
				</div>
			) : (
				<EmptyState
					message={`${isOwner ? "你" : "他"}尚未建立任何機器人`}
					actionButton={
						isOwner ? (
							<Link to="/protected/add-bot">
								<Button className="mt-5 bg-[#5865f2] text-white hover:bg-[#4752c4]">
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
}

const BotCard = memo(
	({
		bot,
		isOwner,
		onManageBot,
		userId,
	}: {
		bot: BotCardData;
		isOwner: boolean;
		onManageBot: (id: string, e: MouseEvent) => void;
		userId: string;
	}) => {
		const queryClient = useQueryClient();
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

		const handleDeleteBot = async () => {
			// 彈出 SweetAlert2 確認視窗
			const result = await Swal.fire({
				title: "確定要刪除機器人嗎？",
				text: `此操作無法復原，將會永久刪除 "${bot.name}"。`,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#d33", // 刪除通常用紅色
				cancelButtonColor: "#3085d6",
				confirmButtonText: "確定刪除",
				cancelButtonText: "取消",
				background: "#1e1f22", // 可以配合你的暗色系/Discord風格
				color: "#fff",
			});

			// 如果使用者點擊了確定
			if (result.isConfirmed) {
				try {
					await deleteBotFn({ data: { botId: bot.id } });

					await queryClient.invalidateQueries({
						queryKey: queryKeys.users.settings(userId),
					});

					Swal.fire({
						title: "已刪除！",
						text: "機器人成功移除。",
						icon: "success",
						background: "#1e1f22",
						color: "#fff",
					});
				} catch (error) {
					Swal.fire({
						title: "錯誤！",
						text: "刪除失敗，請稍後再試。",
						icon: "error",
						background: "#1e1f22",
						color: "#fff",
					});
				}
			}
		};

		return (
			<Card className="flex h-full flex-col border-[#1e1f22] bg-[#2b2d31] transition-all duration-200 hover:border-[#5865f2]">
				<Link to="/bots/$botId" params={{ botId: bot.id }} className="block">
					<CardHeader className="pb-2">
						<div className="flex items-center space-x-3">
							<div className="h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
								<img
									src={bot.icon || "/placeholder.png?height=40&width=40"}
									alt={bot.name}
									className="h-full w-full object-cover"
									loading="lazy"
								/>
							</div>
							<div className="flex items-center gap-2">
								<CardTitle className="truncate text-white">
									{bot.name}
								</CardTitle>
								{bot.verified && (
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge className="5865F2 inline-flex cursor-default items-center gap-1 rounded-full bg-discord px-3 text-sm text-white hover:bg-discord-hover hover:text-white">
													<FaCheck className="h-3.5 w-3.5" />
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
						<p className="line-clamp-2 text-gray-300 text-sm">
							{bot.description ?? ""}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
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
						<div className="mt-2 flex items-center text-gray-400 text-sm">
							<Users size={14} className="mr-1" />
							<span>{(bot.servers ?? 0).toLocaleString()} 伺服器</span>
						</div>
						<BotStatusIndicator status={bot.status ?? "pending"} />
					</CardContent>
				</Link>

				{isOwner && (
					<CardFooter className="mt-auto flex flex-col gap-3">
						<Button
							variant="outline"
							size="sm"
							onClick={handleManageClick}
							className="h-10 w-full cursor-pointer border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2]"
						>
							管理機器人
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleDeleteBot} /* 綁定剛剛建立的刪除確認函數 */
							className="h-10 w-full cursor-pointer border-red-500 text-red-500 hover:bg-red-500 hover:text-red-800 transition-colors"
						>
							刪除機器人
						</Button>
						<PinActionButton itemName={bot.name} />
					</CardFooter>
				)}
			</Card>
		);
	},
);
BotCard.displayName = "BotCard";

function BotStatusIndicator({ status }: { status: string }) {
	if (status === "pending") {
		return (
			<div className="mt-2 flex items-center text-sm text-yellow-500">
				<Clock size={14} className="mr-1" />
				<span>機器人仍在審核中</span>
			</div>
		);
	}
	if (status === "approved") {
		return (
			<div className="mt-2 flex items-center text-green-500 text-sm">
				<CheckCircle size={14} className="mr-1" />
				<span>機器人已通過審核</span>
			</div>
		);
	}
	return null;
}

function FavoritesTab({
	favoriteServers,
	favoriteBots,
}: {
	favoriteServers: UserDetail["favoriteServers"];
	favoriteBots: UserDetail["favoriteBots"];
}) {
	return (
		<div className="mt-6 space-y-8">
			<div>
				<h2 className="mb-4 font-bold text-2xl">收藏的伺服器</h2>
				{favoriteServers.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{favoriteServers.map((server) => (
							<FavoriteServerCard key={server.id} server={server} />
						))}
					</div>
				) : (
					<EmptyState message="沒有收藏的伺服器" />
				)}
			</div>
			<div>
				<h2 className="mb-4 font-bold text-2xl">收藏的機器人</h2>
				{favoriteBots.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{favoriteBots.map((bot) => (
							<FavoriteBotCard key={bot.id} bot={bot} />
						))}
					</div>
				) : (
					<EmptyState message="沒有收藏的機器人" />
				)}
			</div>
		</div>
	);
}

const FavoriteServerCard = memo(
	({ server }: { server: UserDetail["favoriteServers"][0] }) => (
		<Link
			to="/servers/$serverId"
			params={{ serverId: server.id }}
			className="block"
		>
			<Card className="border-[#1e1f22] bg-[#2b2d31] transition-all duration-200 hover:border-[#5865f2]">
				<CardHeader className="pb-2">
					<div className="flex items-center space-x-3">
						<div className="h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
							<img
								src={server.icon || "/placeholder.png?height=40&width=40"}
								alt={server.name}
								className="h-full w-full object-cover"
								loading="lazy"
							/>
						</div>
						<div>
							<CardTitle className="truncate text-white">
								{server.name}
							</CardTitle>
							<CardDescription className="mt-1 text-gray-400">
								{(server.members ?? 0).toLocaleString()} 成員
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<p className="line-clamp-2 text-gray-300 text-sm">
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
			<Card className="border-[#1e1f22] bg-[#2b2d31] transition-all duration-200 hover:border-[#5865f2]">
				<CardHeader className="pb-2">
					<div className="flex items-center space-x-3">
						<div className="h-10 w-10 overflow-hidden rounded-full bg-[#36393f]">
							<img
								src={bot.icon || "/placeholder.png?height=40&width=40"}
								alt={bot.name}
								className="h-full w-full object-cover"
								loading="lazy"
							/>
						</div>
						<div className="flex items-center gap-2">
							<CardTitle className="truncate text-white">{bot.name}</CardTitle>
							{bot.verified && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Badge className="5865F2 inline-flex cursor-default items-center gap-1 rounded-full bg-discord px-3 text-sm text-white hover:bg-discord-hover hover:text-white">
												<FaCheck className="h-3.5 w-3.5" />
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
					<p className="line-clamp-2 text-gray-300 text-sm">
						{bot.description ?? ""}
					</p>
				</CardContent>
			</Card>
		</Link>
	),
);
FavoriteBotCard.displayName = "FavoriteBotCard";

function EmptyState({
	message,
	actionButton,
}: {
	message: string;
	actionButton?: ReactNode;
}) {
	return (
		<div className="rounded-lg bg-[#2b2d31] p-8 text-center">
			<p className="text-gray-300">{message}</p>
			{actionButton}
		</div>
	);
}

// Header 元件無須頻繁變動，可以加上 memo
const UserHeader = memo(({ user }: { user: UserBaseProfile }) => {
	return (
		<div>
			{/* Banner */}
			<div className="relative h-90 overflow-hidden bg-[#36393f]">
				{user.banner ? (
					<div className="relative h-full w-full overflow-hidden">
						<div
							className="absolute inset-0 bg-center bg-cover"
							style={{ backgroundImage: `url(${user.banner})` }}
						></div>
					</div>
				) : user.bannerColor ? (
					<div
						className="h-full w-full"
						style={{ backgroundColor: user.bannerColor }}
					></div>
				) : (
					<div className="h-full w-full bg-linear-to-r from-[#5865f2] to-[#8c54ff]"></div>
				)}
			</div>

			{/* User Info */}
			<div className="relative z-10 mx-auto -mt-13 max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
					<Avatar className="h-32 w-32 border-4 border-[#1e1f22] bg-[#36393f]">
						<AvatarImage
							src={user.avatar}
							alt={user.username}
							className="h-full w-full object-cover"
						/>
						<AvatarFallback
							className="bg-[#5865f2] text-3xl"
							suppressHydrationWarning
						>
							{user.username}
						</AvatarFallback>
					</Avatar>

					<div className="flex flex-col">
						<h1 className="font-bold text-2xl text-white md:text-3xl">
							{user.name || user.username}
						</h1>
						<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-300 text-sm">
							<div className="flex items-center">
								<Calendar size={16} className="mr-1" />
								<span>
									加入於{" "}
									{formatDistanceToNow(new Date(user.createdAt), {
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
					<div className="mt-6 rounded-lg bg-[#2b2d31] p-4">
						<p className="text-gray-300">{user.bio}</p>
					</div>
				)}

				{user.social && Object.entries(user.social).some(([, val]) => val) && (
					<div className="mt-6 flex flex-wrap gap-4">
						{Object.entries(user.social).map(([platform, value]) => {
							if (!value) return null;
							const config =
								SOCIAL_PLATFORMS[platform as keyof typeof SOCIAL_PLATFORMS];
							if (!config) return null;

							const Icon = config.icon;
							const href = config.link ? config.link(value) : value;

							return (
								<a
									key={platform}
									href={href}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 rounded-md bg-[#2b2d31] px-4 py-2 text-gray-300 transition-colors hover:bg-[#36393f] hover:text-white"
								>
									<Icon size={16} />
									<span className="max-w-37.5 truncate">{value}</span>
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

function PinActionButton({ itemName }: { itemName: string }) {
	return (
		<Button
			variant="outline"
			className="h-10 w-full cursor-pointer border-[#5865f2] text-white hover:bg-[#5865f2] hover:text-[#5865f2]"
			onClick={() =>
				showSuccessNotification(`${itemName} 的置頂設定已保留舊版樣式`)
			}
		>
			置頂設定
		</Button>
	);
}

export function UserSettingsForm({ user }: { user: UserSettings }) {
	const queryClient = useQueryClient();

	// 👉 1. 建立 state 來控制 NSFW 過濾器的狀態（假設 true 為啟用過濾/隱藏成人內容）
	const [nsfwFilter, setNsfwFilter] = useState<boolean>(user.nsfw ?? true);

	const mutation = useMutation({
		// 👉 2. 將 nsfw 加入 mutation 接收的型別中
		mutationFn: (input: {
			bio: string;
			social: Record<string, string>;
			nsfw: boolean;
		}) =>
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

	// 👉 3. 處理勾選框變更的邏輯
	const handleNsfwChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const willEnableFilter = e.target.checked;

		// 1. 先讓狀態跟著使用者的操作改變（避免瀏覽器原生行為與 React 脫鉤）
		setNsfwFilter(willEnableFilter);

		if (!willEnableFilter) {
			const result = await Swal.fire({
				title: "年齡確認",
				text: "您是否已滿 18 歲？",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: "#5865f2",
				cancelButtonColor: "#d33",
				confirmButtonText: "是，我已滿 18 歲",
				cancelButtonText: "否",
				background: "#36393f",
				color: "#fff",
				// 允許點擊外面或按 ESC 關閉，並視為「否」
				allowOutsideClick: false,
				allowEscapeKey: false,
			});

			if (!result.isConfirmed) {
				// 2. 如果用戶反悔或點擊「否」，再強制把狀態修正回 true (啟用過濾)
				setNsfwFilter(true);
				toast.success("請記得按下右下角的儲存更改喔~");
			}
		}
	};

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const formData = new FormData(event.currentTarget);

			const social: Record<string, string> = {};
			for (const key of Object.keys(SOCIAL_PLATFORMS)) {
				social[key] = (formData.get(`social.${key}`) as string)?.trim() ?? "";
			}

			const bio = (formData.get("bio") as string)?.trim() ?? "";

			// 👉 4. 提交時帶上 nsfwFilter 狀態
			mutation.mutate({ bio, social, nsfw: nsfwFilter });
		},
		[mutation, nsfwFilter], // 記得將 nsfwFilter 加入依賴陣列
	);

	const socialEntries = Object.entries(SOCIAL_PLATFORMS);
	const socialData = user.social as Record<string, string>;

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-6">
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div className="space-y-2">
						<label className="font-medium text-gray-300 text-sm">
							用戶名
							<input
								type="text"
								value={user.name || user.username}
								disabled
								className="w-full cursor-not-allowed rounded-md border border-[#1e1f22] bg-[#36393f] px-3 py-2 text-white opacity-50"
							/>
						</label>
					</div>

					<div className="space-y-2 md:col-span-2">
						<label className="font-medium text-gray-300 text-sm">
							個人簡介
							<textarea
								name="bio"
								defaultValue={user.bio ?? ""}
								rows={4}
								className="w-full rounded-md border border-[#1e1f22] bg-[#36393f] px-3 py-2 text-white"
							/>
						</label>
					</div>

					{/* 👉 5. 加入 NSFW 過濾的 UI 區塊 */}
					<div className="space-y-2 md:col-span-2 rounded-md border border-[#1e1f22] bg-[#2f3136] p-4">
						<label className="flex cursor-pointer items-center space-x-3">
							<input
								type="checkbox"
								checked={nsfwFilter}
								onChange={handleNsfwChange}
								className="h-5 w-5 rounded border-[#1e1f22] bg-[#36393f] text-[#5865f2] focus:ring-[#5865f2] focus:ring-offset-gray-900"
							/>
							<span className="font-medium text-gray-200 text-sm">
								啟用 NSFW 過濾 (隱藏成人內容)
							</span>
						</label>
						<p className="mt-1 ml-8 text-xs text-gray-400">
							取消勾選以在清單中顯示帶有 NSFW 標籤的伺服器與機器人。
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<h3 className="mb-6 font-bold text-xl">社交連結</h3>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{socialEntries.map(([platform, config]) => (
							<div key={platform} className="space-y-2">
								<label className="font-medium text-gray-300 text-sm">
									{config.name}
									<input
										type="text"
										name={`social.${platform}`}
										defaultValue={socialData?.[platform] || ""}
										className="w-full rounded-md border border-[#1e1f22] bg-[#36393f] px-3 py-2 text-white"
									/>
								</label>
							</div>
						))}
					</div>

					<div className="mt-4 flex justify-end">
						<Button
							type="submit"
							className="bg-[#5865f2] text-white hover:bg-[#4752c4]"
							disabled={mutation.isPending}
						>
							{mutation.isPending ? "保存中..." : "保存更改"}
						</Button>
					</div>
				</div>
			</div>
		</form>
	);
}
