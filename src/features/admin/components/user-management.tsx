// ============================================================
// components/user-management.tsx
// ============================================================

import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { InferSelectModel } from "drizzle-orm";
import {
	AlertTriangle,
	CheckCircle2,
	Loader2,
	Search,
	ShieldAlert,
	User as UserIcon,
} from "lucide-react"; // 移除了 Mail icon
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { user as userSchema } from "#/drizzle/schema";
import { queryKeys } from "#/lib/query-keys";
import { SOCIAL_PLATFORMS } from "#/lib/socal";
import type { SocialData } from "#/types/social";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { toggleUserBanFn } from "../admin.functions";
import { adminUsersInfiniteQueryOptions } from "../admin.query";

type UserType = InferSelectModel<typeof userSchema>;

// ── Custom Hooks ──────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);
	useEffect(() => {
		const handler = setTimeout(() => setDebouncedValue(value), delay);
		return () => clearTimeout(handler);
	}, [value, delay]);
	return debouncedValue;
}

// ── Shared helpers ─────────────────────────────────────────

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});
const formatDate = (d: Date | string | null) =>
	d ? DATE_FORMATTER.format(new Date(d)) : "—";

// ── UserCard ──────────────────────────────────────────────

const UserCard = memo(
	({ user, onView }: { user: UserType; onView: (user: UserType) => void }) => {
		const isBanned = user.banned ?? false;

		return (
			<button
				type="button"
				className="group flex h-full w-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-xl border border-[#000000] bg-[#2b2d31] p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-[#2b2d31]/80 hover:shadow-lg hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:gap-4 sm:p-5"
				onClick={() => onView(user)}
			>
				<div className="space-y-3">
					<div className="flex items-start gap-3 sm:gap-4">
						<img
							src={
								user.image ??
								user.avatar ??
								"https://cdn.discordapp.com/embed/avatars/0.png"
							}
							alt={user.name}
							onError={(e) => {
								e.currentTarget.src =
									"https://cdn.discordapp.com/embed/avatars/0.png";
							}}
							className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
							loading="lazy"
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<h3 className="line-clamp-1 break-words font-semibold text-zinc-100 text-base sm:text-lg">
									{user.name}
								</h3>
								{/* 如果有需要，可以保留某種驗證標籤，但這裡已移除信箱驗證 */}
							</div>
							{/* 改為顯示 Username 幫助辨識 */}
							{user.username && (
								<p className="mt-0.5 line-clamp-1 break-words text-zinc-400 text-xs sm:text-sm">
									@{user.username}
								</p>
							)}
						</div>
					</div>
				</div>
			</button>
		);
	},
);
UserCard.displayName = "UserCard";

// ── UserDetailsDialog ──────────────────────────────────────

const UserDetailsDialog = memo(
	({
		user,
		isOpen,
		onClose,
		onToggleBan,
	}: {
		user: UserType | null;
		isOpen: boolean;
		onClose: () => void;
		onToggleBan: (user: UserType) => void;
	}) => {
		if (!user) return null;

		const isBanned = user.banned ?? false;

		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-h-[90vh] max-w-[95vw] overflow-auto rounded-2xl border-zinc-800 bg-[#2b2d31] p-6 text-zinc-100 shadow-2xl backdrop-blur-xl sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
							<UserIcon className="h-5 w-5 flex-shrink-0 text-indigo-400 sm:h-6 sm:w-6" />
							<span className="line-clamp-1 break-words font-bold tracking-tight">
								用戶詳細資訊
							</span>
						</DialogTitle>
						<DialogDescription className="text-zinc-400">
							內部系統用戶狀態與權限管理
						</DialogDescription>
					</DialogHeader>

					{user.bannerColor || user.banner ? (
						<div
							className="h-24 w-full rounded-xl object-cover shadow-sm"
							style={{
								backgroundColor: user.bannerColor ?? "#202021",
								backgroundImage: user.banner ? `url(${user.banner})` : "none",
								backgroundSize: "cover",
								backgroundPosition: "center",
							}}
						/>
					) : null}

					<div className="grid gap-6 py-4">
						<div className="flex flex-col items-start gap-4 rounded-xl bg-[#2b2d31]/50 p-4 sm:flex-row sm:items-center">
							<img
								src={user.image ?? user.avatar ?? "/placeholder.png"}
								alt={user.name}
								className="h-16 w-16 flex-shrink-0 rounded-full border-2 border-zinc-800 shadow-md sm:h-20 sm:w-20"
							/>

							<div className="w-full min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<h3 className="break-words font-semibold text-lg sm:text-xl">
										{user.name}
									</h3>
									{isBanned && (
										<Badge
											variant="destructive"
											className="bg-rose-500 text-xs"
										>
											Banned
										</Badge>
									)}
								</div>

								<div className="mt-2 space-y-1 text-zinc-400">
									{/* 移除了 Email 與信箱驗證區塊 */}
									{user.username && (
										<p className="text-sm">
											使用者名稱:{" "}
											<strong className="text-zinc-200">{user.username}</strong>
										</p>
									)}
									{user.name && (
										<p className="text-sm">
											全域名稱:{" "}
											<strong className="text-zinc-200">{user.name}</strong>
										</p>
									)}
								</div>
							</div>
						</div>

						{user.bio && (
							<div>
								<h4 className="mb-2 font-medium text-sm text-zinc-300">
									自我介紹 (Bio)
								</h4>
								<p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-[#202021] p-3 text-sm text-zinc-300">
									{user.bio}
								</p>
							</div>
						)}

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">用戶 ID</h4>
								<p className="mt-1.5 break-all font-mono text-xs text-zinc-300">
									{user.id}
								</p>
							</div>

							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">
									Discord ID
								</h4>
								<p className="mt-1.5 break-all font-mono text-sm text-zinc-300">
									{user.discordId ?? "未綁定"}
								</p>
							</div>

							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">
									角色 (Role)
								</h4>
								<p className="mt-1.5 text-sm text-indigo-300 font-semibold">
									{user.role ?? "User"}
								</p>
							</div>

							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">創建時間</h4>
								<p className="mt-1.5 text-sm text-zinc-300">
									{formatDate(user.createdAt)}
								</p>
							</div>
						</div>

						{isBanned && (
							<div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 sm:col-span-2">
								<h4 className="flex items-center gap-2 font-medium text-sm text-rose-400">
									<AlertTriangle className="h-4 w-4" /> 封鎖原因
								</h4>
								<p className="mt-1.5 text-sm text-rose-200">
									{user.banReason ?? "未提供原因"}
								</p>
								{user.banExpires && (
									<p className="mt-1 text-xs text-rose-400/80">
										到期時間: {formatDate(user.banExpires)}
									</p>
								)}
							</div>
						)}

						{user.social && <SocialLinks userSocial={user.social} />}
					</div>

					<div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
						<Button
							variant="outline"
							className="w-full border-zinc-700 bg-transparent text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 sm:w-auto"
							onClick={onClose}
						>
							關閉
						</Button>
						<Button
							className={`w-full text-white shadow-md transition-all active:scale-95 sm:w-auto ${
								isBanned
									? "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 hover:shadow-emerald-500/25"
									: "bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 hover:shadow-rose-500/25"
							}`}
							onClick={() => onToggleBan(user)}
						>
							{isBanned ? (
								<>
									<CheckCircle2 className="mr-2 h-4 w-4" /> 解除封鎖
								</>
							) : (
								<>
									<ShieldAlert className="mr-2 h-4 w-4" /> 封鎖用戶
								</>
							)}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	},
);
UserDetailsDialog.displayName = "UserDetailsDialog";

// ── Ban/Unban Confirm dialog ───────────────────────────────
// (維持不變)

const BanConfirmDialog = memo(
	({
		user,
		isOpen,
		onClose,
		onConfirm,
		isLoading,
	}: {
		user: UserType | null;
		isOpen: boolean;
		onClose: () => void;
		onConfirm: (reason: string) => void;
		isLoading: boolean;
	}) => {
		const [reason, setReason] = useState("");

		if (!user) return null;
		const isCurrentlyBanned = user.banned ?? false;

		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-w-[95vw] rounded-2xl border-zinc-800 bg-[#2b2d31]/95 p-6 text-zinc-100 shadow-2xl backdrop-blur-xl sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							{isCurrentlyBanned ? (
								<CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
							) : (
								<AlertTriangle className="h-5 w-5 flex-shrink-0 text-rose-500" />
							)}
							{isCurrentlyBanned ? "確認解除封鎖" : "確認封鎖用戶"}
						</DialogTitle>

						<DialogDescription className="text-sm text-zinc-400">
							{isCurrentlyBanned
								? "此用戶將恢復正常使用權限。"
								: "此用戶將被踢出且無法存取網站任何內容。"}
						</DialogDescription>
					</DialogHeader>

					<div className="py-4 space-y-4">
						<p className="break-words text-base text-zinc-300">
							您確定要{isCurrentlyBanned ? "解封" : "封鎖"}{" "}
							<strong className="text-white">{user.name}</strong> 嗎？
						</p>

						{!isCurrentlyBanned && (
							<div className="space-y-2">
								<label htmlFor="ban-reason" className="text-sm text-zinc-400">
									封鎖原因 (選填)
								</label>
								<Textarea
									id="ban-reason"
									placeholder="請輸入封鎖原因..."
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									className="min-h-[80px] resize-none border-zinc-800 bg-[#202021] text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-indigo-500"
								/>
							</div>
						)}
					</div>

					<div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
						<Button
							variant="outline"
							className="w-full border-zinc-700 bg-transparent text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 sm:w-auto"
							onClick={onClose}
							disabled={isLoading}
						>
							取消
						</Button>

						<Button
							className={`w-full text-white shadow-md transition-all active:scale-95 sm:w-auto ${
								isCurrentlyBanned
									? "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 hover:shadow-emerald-500/25"
									: "bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 hover:shadow-rose-500/25"
							}`}
							onClick={() => onConfirm(reason)}
							disabled={isLoading}
						>
							{isLoading
								? "處理中..."
								: isCurrentlyBanned
									? "確認解封"
									: "確認封鎖"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	},
);
BanConfirmDialog.displayName = "BanConfirmDialog";

interface SocialLinksProps {
	userSocial: any; // 接收來自後端的原始資料
}

function SocialLinks({
	userSocial,
}: {
	userSocial: SocialLinksProps["userSocial"];
}) {
	// 1. 安全地解析後端傳過來的資料結構
	const parseSocialData = (): SocialData => {
		if (!userSocial) return {};
		try {
			// 處理範例中陣列包 JSON 字串的情況：([{}, "{\"discord\":\"...\"}"])
			if (Array.isArray(userSocial)) {
				const jsonStr = userSocial.find(
					(item) => typeof item === "string" && item.startsWith("{"),
				);
				return jsonStr ? JSON.parse(jsonStr) : {};
			}
			if (typeof userSocial === "object") return userSocial;
			if (typeof userSocial === "string") return JSON.parse(userSocial);
		} catch (e) {
			console.error("解析社群資料失敗:", e);
		}
		return {};
	};

	const socialData = parseSocialData();

	// 2. 過濾出「有填寫」且「存在於你定義的 SOCIAL_PLATFORMS 中」的項目
	const activeSocials = Object.entries(socialData).filter(([key, value]) => {
		const hasValue = value && typeof value === "string" && value.trim() !== "";
		const isPlatformSupported = key.toLowerCase() in SOCIAL_PLATFORMS;
		return hasValue && isPlatformSupported;
	});

	// 如果一個都沒填，就隱藏整個區塊
	if (activeSocials.length === 0) return null;

	return (
		<div className="mt-4">
			{/* 延續你原本 UI 的標題風格 */}
			<h4 className="mb-3 font-medium text-sm text-zinc-300 tracking-wide">
				社群連結 (Social)
			</h4>

			{/* 整合現代化、有質感的按鈕列表 */}
			<div className="flex flex-wrap gap-2">
				{activeSocials.map(([key, value]) => {
					// 這裡的 key 對應到你的 discord, twitter, github 等
					const platformKey = key.toLowerCase();
					const platform = SOCIAL_PLATFORMS[platformKey];

					if (!platform || !value) return null;

					const Icon = platform.icon;
					// 呼叫你寫好的 link 函式自動轉換成完整網址，如果沒有 link 函式則退回原本的值
					const targetUrl = platform.link ? platform.link(value) : value;

					return (
						<a
							key={key}
							href={targetUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium transition-all duration-200 hover:text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
						>
							{/* 直接渲染你配置的 FaIcon */}
							<Icon className="w-4 h-4" />
							<span>{platform.name}</span>
						</a>
					);
				})}
			</div>
		</div>
	);
}

const EmptyState = ({ message }: { message: string }) => (
	<div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#2b2d31]/20 py-12 text-center text-zinc-500">
		<Search className="mb-3 h-8 w-8 opacity-20" />
		<p className="text-sm sm:text-base">{message}</p>
	</div>
);

// ── Main component ─────────────────────────────────────────

export default function UserManagement() {
	const queryClient = useQueryClient();

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 500);

	const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [actionUser, setActionUser] = useState<UserType | null>(null);
	const [isActionOpen, setIsActionOpen] = useState(false);

	const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
		useInfiniteQuery(adminUsersInfiniteQueryOptions(debouncedSearch));

	const users = useMemo(() => {
		return data?.pages.flatMap((page) => page?.users || []) || [];
	}, [data]);

	const observerTarget = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
					fetchNextPage();
				}
			},
			{
				threshold: 0.1,
				rootMargin: "100px",
			},
		);

		const currentTarget = observerTarget.current;
		if (currentTarget) {
			observer.observe(currentTarget);
		}

		return () => {
			if (currentTarget) {
				observer.unobserve(currentTarget);
			}
		};
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const toggleBanMutation = useMutation({
		mutationFn: (payload: {
			targetUserId: string;
			isBanned: boolean;
			reason?: string;
		}) => toggleUserBanFn({ data: payload }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
			setIsActionOpen(false);
			setIsDetailOpen(false);
		},
		onError: (err) => {
			console.error("操作失敗", err);
			alert("狀態更新失敗，請查看控制台");
		},
	});

	const handleOpenDetail = useCallback((user: UserType) => {
		setSelectedUser(user);
		setIsDetailOpen(true);
	}, []);

	const handleOpenAction = useCallback((user: UserType) => {
		setActionUser(user);
		setIsActionOpen(true);
	}, []);

	const handleCloseDetail = useCallback(() => {
		setIsDetailOpen(false);
	}, []);

	const handleCloseAction = useCallback(() => {
		if (!toggleBanMutation.isPending) {
			setIsActionOpen(false);
		}
	}, [toggleBanMutation.isPending]);

	const handleConfirmAction = useCallback(
		(reason: string) => {
			if (!actionUser) return;
			const nextBanState = !(actionUser.banned ?? false);

			toggleBanMutation.mutate({
				targetUserId: actionUser.id,
				isBanned: nextBanState,
				reason: nextBanState ? reason : undefined,
			});
		},
		[actionUser, toggleBanMutation],
	);

	return (
		<Card className="overflow-hidden rounded-2xl border-zinc-800 bg-[#2b2d31] text-zinc-100 shadow-xl">
			<CardHeader className="border-b border-zinc-800/50 bg-[#2b2d31]/20 space-y-1.5 p-5 sm:p-6">
				<CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
					<UserIcon className="h-5 w-5 text-indigo-400" />
					系統用戶管理
				</CardTitle>
			</CardHeader>

			<CardContent className="p-4 sm:p-6">
				<div className="space-y-6">
					<div className="relative group">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
						<Input
							placeholder="透過後端即時搜尋名稱 (Name)、使用者名稱 (Username) 或 ID..."
							className="h-11 rounded-xl border-zinc-800 bg-[#2b2d31]/50 pl-10"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					<div className="mt-4 animate-in fade-in duration-500">
						{isLoading ? (
							<EmptyState message="載入用戶中..." />
						) : users.length === 0 ? (
							<EmptyState
								message={
									debouncedSearch ? "沒有符合搜尋的用戶" : "目前沒有任何用戶"
								}
							/>
						) : (
							<>
								<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 lg:gap-5">
									{users.map((user) => (
										<UserCard
											key={user.id}
											user={user}
											onView={handleOpenDetail}
										/>
									))}
								</div>

								{hasNextPage && (
									<div
										ref={observerTarget}
										className="mt-6 flex w-full items-center justify-center py-4"
									>
										{isFetchingNextPage ? (
											<div className="flex items-center text-sm text-zinc-400">
												<Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
												載入更多用戶中...
											</div>
										) : (
											<div className="text-sm text-zinc-500 opacity-50">
												向下滾動以載入更多
											</div>
										)}
									</div>
								)}

								{!hasNextPage && users.length > 0 && (
									<div className="mt-6 text-center text-sm text-zinc-500 opacity-50">
										已經到底囉！
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</CardContent>

			<UserDetailsDialog
				user={selectedUser}
				isOpen={isDetailOpen}
				onClose={handleCloseDetail}
				onToggleBan={handleOpenAction}
			/>

			<BanConfirmDialog
				user={actionUser}
				isOpen={isActionOpen}
				onClose={handleCloseAction}
				onConfirm={handleConfirmAction}
				isLoading={toggleBanMutation.isPending}
			/>
		</Card>
	);
}
