// ============================================================
// components/user-management.tsx
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferSelectModel } from "drizzle-orm";
import {
	AlertTriangle,
	Ban,
	Calendar,
	CheckCircle2,
	Mail,
	Search,
	ShieldAlert,
	User as UserIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import type { user as userSchema } from "#/drizzle/schema";
import { queryKeys } from "#/lib/query-keys";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
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
import { getUsersFn, toggleUserBanFn } from "../admin.functions";
import { adminUsersQueryOptions } from "../admin.query";

// 使用 Drizzle Schema 推導型別
type UserType = InferSelectModel<typeof userSchema>;

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

// ── UserCard ───────────────────────────────────────────────

const UserCard = memo(
	({ user, onView }: { user: UserType; onView: (user: UserType) => void }) => {
		const isBanned = user.banned ?? false;

		return (
			<button
				type="button" // 記得一定要加，防止在 form 裡面被當成 submit
				className="group flex h-full w-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-xl border border-[#000000] bg-[#2b2d31] p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-[#2b2d31]/80 hover:shadow-lg hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:gap-4 sm:p-5"
				onClick={() => onView(user)}
			>
				<div className="space-y-3">
					<div className="flex items-start gap-3 sm:gap-4">
						<img
							src={user.image ?? user.avatar ?? "/placeholder.png"}
							alt={user.name}
							className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
							loading="lazy"
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<h3 className="line-clamp-1 break-words font-semibold text-zinc-100 text-base sm:text-lg">
									{user.name}
								</h3>
								{user.emailVerified && (
									<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
								)}
							</div>
							<p className="mt-0.5 line-clamp-1 break-words text-zinc-400 text-xs sm:text-sm">
								{user.email}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap gap-1.5">
						<Badge
							variant="outline"
							className="whitespace-nowrap border-zinc-700 bg-[#2b2d31] text-xs text-zinc-300 transition-colors group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 group-hover:text-indigo-300"
						>
							{user.role ?? "user"}
						</Badge>
						{isBanned && (
							<Badge
								variant="outline"
								className="whitespace-nowrap border-rose-900 bg-rose-500/10 text-xs text-rose-400"
							>
								已封鎖
							</Badge>
						)}
						{user.discordId && (
							<Badge
								variant="outline"
								className="whitespace-nowrap border-blue-900 bg-blue-500/10 text-xs text-blue-400"
							>
								Discord 連結
							</Badge>
						)}
					</div>
				</div>

				<div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-3">
					<div className="flex items-center gap-1.5 text-zinc-400 text-xs sm:text-sm">
						<Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
						<span className="font-medium">{formatDate(user.createdAt)}</span>
					</div>
					<div className="flex items-center gap-2">
						{isBanned ? (
							<Ban className="h-4 w-4 text-rose-500" />
						) : (
							<UserIcon className="h-4 w-4 text-zinc-500" />
						)}
					</div>
				</div>
			</button>
		);
	},
);
UserCard.displayName = "UserCard";

// ── User details dialog ────────────────────────────────────

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

					{/* Banner 區域 (如果有的話) */}
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
									<p className="flex items-center gap-2 text-sm">
										<Mail className="h-4 w-4" />
										{user.email}
										{user.emailVerified ? (
											<span className="text-emerald-400">(已驗證)</span>
										) : (
											<span className="text-rose-400">(未驗證)</span>
										)}
									</p>
									{user.username && (
										<p className="text-sm">使用者名稱: @{user.username}</p>
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
							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">最後更新</h4>
								<p className="mt-1.5 text-sm text-zinc-300">
									{formatDate(user.updatedAt)}
								</p>
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
						</div>

						{user.social && (
							<div>
								<h4 className="mb-2 font-medium text-sm text-zinc-300">
									社群連結 (Social)
								</h4>
								<pre className="mt-2 overflow-x-auto rounded-md bg-[#202021] p-3 text-xs text-zinc-300">
									{JSON.stringify(user.social, null, 2)}
								</pre>
							</div>
						)}
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
								: "此用戶將被踢出且無法存取系統，資料將同步至 KV。"}
						</DialogDescription>
					</DialogHeader>

					<div className="py-4 space-y-4">
						<p className="break-words text-base text-zinc-300">
							您確定要{isCurrentlyBanned ? "解封" : "封鎖"}{" "}
							<strong className="text-white">{user.name}</strong> 嗎？
						</p>

						{!isCurrentlyBanned && (
							<div className="space-y-2">
								{/* 1. 加上 htmlFor */}
								<label htmlFor="ban-reason" className="text-sm text-zinc-400">
									封鎖原因 (選填)
								</label>
								<Textarea
									id="ban-reason" // 2. 加上對應的 id
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

// ── Empty state ────────────────────────────────────────────

const EmptyState = ({ message }: { message: string }) => (
	<div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#2b2d31]/20 py-12 text-center text-zinc-500">
		<Search className="mb-3 h-8 w-8 opacity-20" />
		<p className="text-sm sm:text-base">{message}</p>
	</div>
);

// ── Main component ─────────────────────────────────────────

export default function UserManagement() {
	const queryClient = useQueryClient();

	// 搜尋狀態
	const [search, setSearch] = useState("");
	// 優化 🚀: 延遲列表過濾的值，讓輸入框打字不會被列表渲染卡住
	const deferredSearch = useDeferredValue(search);

	// 控制 Dialog 狀態
	const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(false);

	const [actionUser, setActionUser] = useState<UserType | null>(null);
	const [isActionOpen, setIsActionOpen] = useState(false);

	// 優化 🚀: 使用提取出來的 Query Options
	const { data: users = [], isLoading } = useQuery(adminUsersQueryOptions());

	// 使用 Mutation 來觸發封鎖/解封
	const toggleBanMutation = useMutation({
		mutationFn: (payload: {
			targetUserId: string;
			isBanned: boolean;
			reason?: string;
		}) => toggleUserBanFn({ data: payload }),
		onSuccess: () => {
			// 優化 🚀: 使用統一管理的 queryKeys
			queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
			setIsActionOpen(false);
			setIsDetailOpen(false);
		},
		onError: (err) => {
			console.error("操作失敗", err);
			alert("狀態更新失敗，請查看控制台");
		},
	});

	// 本地過濾搜尋邏輯
	const filteredUsers = useMemo(() => {
		// 優化 🚀: 使用 deferredSearch 而非 search
		if (!deferredSearch.trim()) return users;
		const s = deferredSearch.toLowerCase();
		return users.filter(
			(u) =>
				u.name.toLowerCase().includes(s) ||
				u.email.toLowerCase().includes(s) ||
				u.id.toLowerCase().includes(s),
		);
	}, [users, deferredSearch]);

	// Dialog 控制函式
	const handleOpenDetail = useCallback((user: UserType) => {
		setSelectedUser(user);
		setIsDetailOpen(true);
	}, []);

	const handleOpenAction = useCallback((user: UserType) => {
		setActionUser(user);
		setIsActionOpen(true);
	}, []);

	// 優化 🚀: 將關閉邏輯用 useCallback 包起來，避免破壞子元件的 React.memo
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
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20">
						<UserIcon className="h-5 w-5 text-indigo-400" />
					</div>
					系統用戶管理
				</CardTitle>
				<CardDescription className="text-sm text-zinc-400">
					管理所有註冊使用者，包含身分狀態與系統存取權限 (KV 同步)。
				</CardDescription>
			</CardHeader>

			<CardContent className="p-4 sm:p-6">
				<div className="space-y-6">
					<div className="relative group">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400" />
						<Input
							placeholder="搜尋用戶名稱、信箱或 ID..."
							className="h-11 rounded-xl border-zinc-800 bg-[#2b2d31]/50 pl-10 text-sm text-zinc-100 transition-all placeholder:text-zinc-500 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 sm:text-base"
							value={search} // 輸入框依然綁定即時的 search 保持流暢
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					<div className="mt-4 animate-in fade-in duration-500">
						{isLoading ? (
							<EmptyState message="載入用戶中..." />
						) : filteredUsers.length === 0 ? (
							<EmptyState
								message={
									deferredSearch ? "沒有符合搜尋的用戶" : "目前沒有任何用戶"
								}
							/>
						) : (
							<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 lg:gap-5">
								{filteredUsers.map((user) => (
									<UserCard
										key={user.id}
										user={user}
										onView={handleOpenDetail}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</CardContent>

			{/* 檢視細節對話框 */}
			<UserDetailsDialog
				user={selectedUser}
				isOpen={isDetailOpen}
				onClose={handleCloseDetail}
				onToggleBan={handleOpenAction}
			/>

			{/* 封鎖/解封確認對話框 */}
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
