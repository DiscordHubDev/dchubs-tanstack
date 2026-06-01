// ============================================================
// components/bot-server-management.tsx
// ============================================================

import {
	AlertTriangle,
	Bot,
	Calendar,
	ExternalLink,
	Search,
	Server,
	Trash2,
	Users,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { useDialog } from "#/hooks/use-dialog";
import { useManagement } from "#/hooks/use-management";
import type { Bot as BotType, DiscordServer, ManagedItem } from "#/types/admin";
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
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../../components/ui/tabs";

// ── Shared helpers ─────────────────────────────────────────

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
};
const formatDate = (d: Date | string | null) =>
	d ? new Date(d).toLocaleString("zh-TW", DATE_FORMAT) : "—";

// ── ItemCard ───────────────────────────────────────────────

const ItemCard = memo(
	({
		item,
		onView,
		onDelete,
	}: {
		item: ManagedItem;
		onView: (item: ManagedItem) => void;
		onDelete: (item: ManagedItem) => void;
	}) => {
		const isBot = item.kind === "bot";
		const stat = isBot ? item.servers : item.members;
		const StatIcon = isBot ? Server : Users;

		return (
			// biome-ignore lint/a11y/useSemanticElements: This is a complex card with a nested delete button, so a native button cannot be used here.
			<div
				// [樣式調整]: 加入 group 群組控制、平滑過渡 (transition-all)、hover 上浮與發光陰影效果、圓角加大 (rounded-xl)
				className="group flex h-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-xl border border-[#000000] bg-[#2b2d31] p-3 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-[#2b2d31]/80 hover:shadow-lg hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:gap-4 sm:p-5"
				onClick={() => onView(item)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onView(item);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="space-y-3">
					<div className="flex items-start gap-3 sm:gap-4">
						<img
							src={item.icon ?? "/placeholder.png"}
							alt={item.name}
							// [樣式調整]: 圖片加上輕微的陰影與 hover 時的放大效果
							className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
							loading="lazy"
						/>
						<div className="min-w-0 flex-1">
							{/* [樣式調整]: 文字強調對比度 */}
							<h3 className="line-clamp-1 break-words font-semibold text-zinc-100 text-base sm:text-lg">
								{item.name}
							</h3>
							<p className="mt-0.5 line-clamp-2 break-words text-zinc-400 text-xs sm:text-sm">
								{item.description}
							</p>
						</div>
					</div>

					{item.tags && item.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{item.tags.slice(0, 3).map((tag) => (
								<Badge
									key={tag}
									variant="outline"
									// [樣式調整]: 徽章改為半透明背景，隨父元素 hover 改變顏色，增添互動感
									className="whitespace-nowrap border-zinc-700 bg-[#2b2d31] text-xs text-zinc-300 transition-colors group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 group-hover:text-indigo-300"
								>
									{tag}
								</Badge>
							))}
							{item.tags.length > 3 && (
								<Badge
									variant="outline"
									className="border-zinc-700 bg-[#2b2d31] text-xs text-zinc-400"
								>
									+{item.tags.length - 3}
								</Badge>
							)}
						</div>
					)}
				</div>

				{/* [樣式調整]: 分隔線顏色與間距優化 */}
				<div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-3">
					<div className="flex items-center gap-1.5 text-zinc-400 text-xs sm:text-sm">
						<StatIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
						<span className="font-medium">{stat}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						// [樣式調整]: 刪除按鈕改成柔和的紅色，點擊時有內縮動畫 (active:scale-90)
						className="h-8 w-8 text-rose-400 opacity-0 transition-all active:scale-90 group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300 focus:opacity-100"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(item);
						}}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</div>
		);
	},
);
ItemCard.displayName = "ItemCard";

// ── Item details dialog ────────────────────────────────────

const ItemDetailsDialog = memo(
	({
		item,
		isOpen,
		onClose,
		onDelete,
	}: {
		item: ManagedItem | null;
		isOpen: boolean;
		onClose: () => void;
		onDelete: (item: ManagedItem) => void;
	}) => {
		if (!item) return null;
		const isBot = item.kind === "bot";

		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				{/* [樣式調整]: 對話框加上毛玻璃背景 (backdrop-blur-xl)、漸層邊框感、圓角加大 */}
				<DialogContent className="max-h-[90vh] max-w-[95vw] overflow-auto rounded-2xl border-zinc-800 bg-[#2b2d31] p-6 text-zinc-100 shadow-2xl backdrop-blur-xl sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
							{isBot ? (
								// [樣式調整]: Icon 顏色改用漸層色系強調
								<Bot className="h-5 w-5 flex-shrink-0 text-indigo-400 sm:h-6 sm:w-6" />
							) : (
								<Server className="h-5 w-5 flex-shrink-0 text-indigo-400 sm:h-6 sm:w-6" />
							)}
							<span className="line-clamp-2 break-words font-bold tracking-tight">
								{item.name}
							</span>
						</DialogTitle>
						<DialogDescription className="text-zinc-400">
							{isBot ? "機器人" : "伺服器"}詳細資訊
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-6 py-4">
						<div className="flex flex-col items-start gap-4 rounded-xl bg-[#2b2d31]/50 p-4 sm:flex-row sm:items-center">
							<img
								src={item.icon ?? "/placeholder.png"}
								alt={item.name}
								className="h-16 w-16 flex-shrink-0 rounded-full border-2 border-zinc-800 shadow-md sm:h-20 sm:w-20"
							/>
							<div className="w-full min-w-0 flex-1">
								<h3 className="break-words font-semibold text-lg sm:text-xl">
									{item.name}
								</h3>
								{isBot ? (
									<div className="mt-2 space-y-2 text-zinc-400">
										<p className="font-medium text-sm text-zinc-300">
											開發團隊
										</p>
										<ul className="list-inside list-disc space-y-1 text-sm marker:text-indigo-500">
											{item.developers.map((d) => (
												<li key={d.id} className="break-words">
													{d.username}
												</li>
											))}
										</ul>
									</div>
								) : (
									<div className="mt-2 space-y-2 text-zinc-400">
										<p className="font-medium text-sm text-zinc-300">
											擁有者：
											<span className="text-zinc-400">
												{item.owner?.username ?? "未知"}
											</span>
										</p>
										{item.admins.length > 0 && (
											<>
												<p className="mt-3 font-medium text-sm text-zinc-300">
													伺服器管理員
												</p>
												<ul className="list-inside list-disc space-y-1 text-sm marker:text-indigo-500">
													{item.admins.map((a) => (
														<li key={a.id} className="break-words">
															{a.username}
														</li>
													))}
												</ul>
											</>
										)}
									</div>
								)}
							</div>
						</div>

						<div>
							<h4 className="mb-2 font-medium text-sm text-zinc-300">描述</h4>
							{/* [樣式調整]: 描述文字區塊增加輕微背景與行距 */}
							<p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-[#202021] p-3 text-sm">
								{item.description}
							</p>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
								<h4 className="font-medium text-sm text-zinc-400">創建時間</h4>
								<div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-200">
									<Calendar className="h-4 w-4 flex-shrink-0 text-indigo-400" />
									<span>
										{formatDate(isBot ? item.approvedAt : item.createdAt)}
									</span>
								</div>
							</div>

							{isBot ? (
								<>
									<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
										<h4 className="font-medium text-sm text-zinc-400">
											伺服器數
										</h4>
										<div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-200">
											<Server className="h-4 w-4 text-indigo-400" />
											<span className="font-medium">{item.servers}</span>
										</div>
									</div>
									<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
										<h4 className="font-medium text-sm text-zinc-400">
											前綴指令
										</h4>
										<p className="mt-1.5 break-words font-mono text-sm text-zinc-200">
											{item.prefix ?? "—"}
										</p>
									</div>
									<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
										<h4 className="font-medium text-sm text-zinc-400">
											官方網站
										</h4>
										{item.website ? (
											<a
												href={item.website}
												target="_blank"
												rel="noopener noreferrer"
												// [樣式調整]: 連結顏色優化，hover 加底線與顏色提亮
												className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-indigo-400 transition-colors hover:text-indigo-300 hover:underline"
											>
												{item.website}
												<ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
											</a>
										) : (
											<p className="mt-1.5 text-sm text-zinc-500">無</p>
										)}
									</div>
								</>
							) : (
								<div className="rounded-lg border border-zinc-800/50 bg-[#202021] p-3">
									<h4 className="font-medium text-sm text-zinc-400">成員數</h4>
									<div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-200">
										<Users className="h-4 w-4 text-indigo-400" />
										<span className="font-medium">{item.members}</span>
									</div>
								</div>
							)}
						</div>

						{item.tags && item.tags.length > 0 && (
							<div>
								<h4 className="mb-2 font-medium text-sm text-zinc-300">
									{isBot ? "標籤" : "分類"}
								</h4>
								<div className="flex flex-wrap gap-2">
									{item.tags.map((tag) => (
										<Badge
											key={tag}
											// [樣式調整]: 詳細彈窗內的 Badge 使用漸層色，讓視覺更豐富
											className="bg-gradient-to-r from-indigo-500 to-blue-500 text-xs text-white shadow-sm hover:from-indigo-400 hover:to-blue-400 sm:text-sm"
										>
											{tag}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
						<Button
							variant="outline"
							// [樣式調整]: 調整按鈕互動狀態與對比
							className="w-full border-zinc-700 bg-transparent text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 sm:w-auto"
							onClick={onClose}
						>
							關閉
						</Button>
						<Button
							// [樣式調整]: 刪除按鈕加上漸層與較強烈的 hover 效果
							className="w-full bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md transition-all hover:from-rose-500 hover:to-red-400 hover:shadow-rose-500/25 active:scale-95 sm:w-auto"
							onClick={() => {
								onDelete(item);
								onClose();
							}}
						>
							<Trash2 className="mr-2 h-4 w-4" /> 刪除
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	},
);
ItemDetailsDialog.displayName = "ItemDetailsDialog";

// ── Delete confirm dialog ──────────────────────────────────

const DeleteConfirmDialog = memo(
	({
		item,
		isOpen,
		onClose,
		onConfirm,
	}: {
		item: ManagedItem | null;
		isOpen: boolean;
		onClose: () => void;
		onConfirm: () => void;
	}) => {
		if (!item) return null;
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-w-[95vw] rounded-2xl border-zinc-800 bg-[#2b2d31]/95 p-6 text-zinc-100 shadow-2xl backdrop-blur-xl sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							<AlertTriangle className="h-5 w-5 flex-shrink-0 text-rose-500" />
							確認刪除
						</DialogTitle>
						<DialogDescription className="text-sm text-zinc-400">
							此操作無法撤銷。
						</DialogDescription>
					</DialogHeader>
					<p className="break-words py-4 text-base text-zinc-300">
						您確定要刪除{item.kind === "bot" ? "機器人" : "伺服器"}{" "}
						<strong className="text-white">{item.name}</strong> 嗎？
					</p>
					<div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
						<Button
							variant="outline"
							className="w-full border-zinc-700 bg-transparent text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 sm:w-auto"
							onClick={onClose}
						>
							取消
						</Button>
						<Button
							className="w-full bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md transition-all hover:from-rose-500 hover:to-red-400 hover:shadow-rose-500/25 active:scale-95 sm:w-auto"
							onClick={onConfirm}
						>
							刪除
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	},
);
DeleteConfirmDialog.displayName = "DeleteConfirmDialog";

// ── Empty state ────────────────────────────────────────────

const EmptyState = ({ message }: { message: string }) => (
	// [樣式調整]: 空狀態增加一點圖示感與圓潤邊框
	<div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#2b2d31]/20 py-12 text-center text-zinc-500">
		<Search className="mb-3 h-8 w-8 opacity-20" />
		<p className="text-sm sm:text-base">{message}</p>
	</div>
);

// ── Main component ─────────────────────────────────────────

export default function BotServerManagement({
	bots: initialBots,
	servers: initialServers,
}: {
	bots: readonly BotType[];
	servers: readonly DiscordServer[];
}) {
	const { filteredBots, filteredServers, search, setSearch, remove } =
		useManagement({
			initialBots,
			initialServers,
		});

	const detailDialog = useDialog<ManagedItem>();
	const deleteDialog = useDialog<ManagedItem>();
	const [activeTab, setActiveTab] = useState<"bots" | "servers">("bots");

	const handleDelete = useCallback(async () => {
		if (!deleteDialog.item) return;
		const ok = await remove(deleteDialog.item);
		if (ok) {
			deleteDialog.close();
			if (detailDialog.item?.id === deleteDialog.item.id) detailDialog.close();
		}
	}, [deleteDialog, detailDialog, remove]);

	const toBotItem = useCallback(
		(b: BotType): ManagedItem => ({ ...b, kind: "bot" as const }),
		[],
	);
	const toServerItem = useCallback(
		(s: DiscordServer): ManagedItem => ({ ...s, kind: "server" as const }),
		[],
	);

	return (
		// [樣式調整]: 主卡片加上漂亮的外框陰影 (shadow-xl) 以及乾淨的深色背景
		<Card className="overflow-hidden rounded-2xl border-zinc-800 bg-[#2b2d31] text-zinc-100 shadow-xl">
			<CardHeader className="border-b border-zinc-800/50 bg-[#2b2d31]/20 space-y-1.5 p-5 sm:p-6">
				<CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
					{/* [樣式調整]: 標題圖示加上漸層特效的背景包裹 */}
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20">
						<Server className="h-5 w-5 text-indigo-400" />
					</div>
					機器人和伺服器管理
				</CardTitle>
				<CardDescription className="text-sm text-zinc-400">
					管理所有已批准的機器人和已連接的伺服器
				</CardDescription>
			</CardHeader>

			<CardContent className="p-4 sm:p-6">
				<div className="space-y-6">
					<div className="relative group">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400" />
						<Input
							placeholder="搜尋機器人或伺服器..."
							// [樣式調整]: 輸入框圓角加大、增加焦點發光效果 (focus-visible:ring)
							className="h-11 rounded-xl border-zinc-800 bg-[#2b2d31]/50 pl-10 text-sm text-zinc-100 transition-all placeholder:text-zinc-500 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 sm:text-base"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					<Tabs
						value={activeTab}
						onValueChange={(v) => setActiveTab(v as "bots" | "servers")}
						className="space-y-4"
					>
						{/* [樣式調整]: 將 bg-[#2b2d31]/80 改為更深的 bg-black/20 以製造「凹槽感」，同時將 p-1 加大至 p-1.5 防止溢出 */}
						<TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-black/20 p-1 text-zinc-400 border border-zinc-800/40">
							<TabsTrigger
								value="bots"
								className="rounded-lg text-sm font-medium transition-all duration-300 hover:text-zinc-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm sm:text-base"
							>
								<Bot className="mr-2 h-4 w-4" /> 機器人
							</TabsTrigger>
							<TabsTrigger
								value="servers"
								className="rounded-lg text-sm font-medium transition-all duration-300 hover:text-zinc-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm sm:text-base"
							>
								<Server className="mr-2 h-4 w-4" /> 伺服器
							</TabsTrigger>
						</TabsList>

						{/* [樣式調整]: Tab 切換時加上動畫 fade-in */}
						<TabsContent
							value="bots"
							className="mt-4 animate-in fade-in duration-500"
						>
							{filteredBots.length === 0 ? (
								<EmptyState
									message={search ? "沒有符合搜尋的機器人" : "沒有找到機器人"}
								/>
							) : (
								<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
									{filteredBots.map((bot) => {
										const item = toBotItem(bot);
										return (
											<ItemCard
												key={bot.id}
												item={item}
												onView={detailDialog.open}
												onDelete={deleteDialog.open}
											/>
										);
									})}
								</div>
							)}
						</TabsContent>

						<TabsContent
							value="servers"
							className="mt-4 animate-in fade-in duration-500"
						>
							{filteredServers.length === 0 ? (
								<EmptyState
									message={search ? "沒有符合搜尋的伺服器" : "沒有找到伺服器"}
								/>
							) : (
								<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
									{filteredServers.map((server) => {
										const item = toServerItem(server);
										return (
											<ItemCard
												key={server.id}
												item={item}
												onView={detailDialog.open}
												onDelete={deleteDialog.open}
											/>
										);
									})}
								</div>
							)}
						</TabsContent>
					</Tabs>
				</div>
			</CardContent>

			<ItemDetailsDialog
				item={detailDialog.item}
				isOpen={detailDialog.isOpen}
				onClose={detailDialog.close}
				onDelete={deleteDialog.open}
			/>

			<DeleteConfirmDialog
				item={deleteDialog.item}
				isOpen={deleteDialog.isOpen}
				onClose={deleteDialog.close}
				onConfirm={handleDelete}
			/>
		</Card>
	);
}
