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
				className="flex h-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-md border border-[#202225] bg-[#36393F] p-3 transition-colors hover:border-[#5865F2] sm:gap-4 sm:p-4"
				onClick={() => onView(item)}
				// --- 以下是為了解決 Linter 報錯新增的部分 ---
				onKeyDown={(e) => {
					// 支援使用 Enter 鍵或空白鍵觸發卡片點擊
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault(); // 重要：防止按空白鍵時網頁自動向下捲動
						onView(item);
					}
				}}
				role="button"
				tabIndex={0}
				// ------------------------------------------
			>
				<div className="space-y-3">
					<div className="flex items-start gap-2 sm:gap-3">
						<img
							src={item.icon ?? "/placeholder.png"}
							alt={item.name}
							className="h-8 w-8 flex-shrink-0 rounded-full sm:h-10 sm:w-10"
							loading="lazy"
						/>
						<div className="min-w-0 flex-1">
							<h3 className="line-clamp-1 break-words font-semibold text-sm sm:text-base">
								{item.name}
							</h3>
							<p className="mt-0.5 line-clamp-2 break-words text-gray-400 text-xs sm:text-sm">
								{item.description}
							</p>
						</div>
					</div>

					{item.tags && item.tags.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{item.tags.slice(0, 3).map((tag) => (
								<Badge
									key={tag}
									variant="outline"
									className="whitespace-nowrap border-none bg-[#4E5058] text-xs"
								>
									{tag}
								</Badge>
							))}
							{item.tags.length > 3 && (
								<Badge
									variant="outline"
									className="border-none bg-[#4E5058] text-xs"
								>
									+{item.tags.length - 3}
								</Badge>
							)}
						</div>
					)}
				</div>

				<div className="flex items-center justify-between border-[#202225] border-t pt-2">
					<div className="flex items-center gap-1 text-gray-400 text-xs sm:text-sm">
						<StatIcon className="h-3 w-3 sm:h-4 sm:w-4" />
						<span>{stat}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-[#ED4245] hover:bg-[#ED4245] hover:text-white"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(item);
						}}
					>
						<Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
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
				<DialogContent className="max-h-[90vh] max-w-[95vw] overflow-auto border-[#202225] bg-[#36393F] text-white sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
							{isBot ? (
								<Bot className="h-4 w-4 flex-shrink-0 text-[#5865F2] sm:h-5 sm:w-5" />
							) : (
								<Server className="h-4 w-4 flex-shrink-0 text-[#5865F2] sm:h-5 sm:w-5" />
							)}
							<span className="line-clamp-2 break-words">{item.name}</span>
						</DialogTitle>
						<DialogDescription className="text-gray-400">
							{isBot ? "機器人" : "伺服器"}詳情
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
							<img
								src={item.icon ?? "/placeholder.png"}
								alt={item.name}
								className="h-12 w-12 flex-shrink-0 rounded-full sm:h-16 sm:w-16"
							/>
							<div className="w-full min-w-0 flex-1">
								<h3 className="break-words font-semibold text-base sm:text-lg">
									{item.name}
								</h3>
								{isBot ? (
									<div className="mt-2 space-y-2 text-gray-400">
										<p className="font-semibold text-sm">開發者</p>
										<ul className="list-inside list-disc space-y-1 text-sm">
											{item.developers.map((d) => (
												<li key={d.id} className="break-words">
													{d.username}
												</li>
											))}
										</ul>
									</div>
								) : (
									<div className="mt-2 space-y-2 text-gray-400">
										<p className="font-semibold text-sm">
											擁有者：{item.owner?.username ?? "未知"}
										</p>
										{item.admins.length > 0 && (
											<>
												<p className="font-semibold text-sm">伺服器管理</p>
												<ul className="list-inside list-disc space-y-1 text-sm">
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
							<h4 className="mb-1 font-medium text-gray-400 text-sm">描述</h4>
							<p className="whitespace-pre-wrap break-words text-sm">
								{item.description}
							</p>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
							<div>
								<h4 className="font-medium text-gray-400 text-sm">創建時間</h4>
								<div className="mt-1 flex items-center gap-1 text-sm">
									<Calendar className="h-4 w-4 flex-shrink-0 text-gray-400" />
									<span>
										{formatDate(isBot ? item.approvedAt : item.createdAt)}
									</span>
								</div>
							</div>

							{isBot ? (
								<>
									<div>
										<h4 className="font-medium text-gray-400 text-sm">
											伺服器數
										</h4>
										<div className="mt-1 flex items-center gap-1 text-sm">
											<Server className="h-4 w-4 text-gray-400" />
											<span>{item.servers}</span>
										</div>
									</div>
									<div>
										<h4 className="font-medium text-gray-400 text-sm">前綴</h4>
										<p className="mt-1 break-words text-sm">
											{item.prefix ?? "—"}
										</p>
									</div>
									<div>
										<h4 className="font-medium text-gray-400 text-sm">網站</h4>
										{item.website ? (
											<a
												href={item.website}
												target="_blank"
												rel="noopener noreferrer"
												className="mt-1 flex items-center gap-1 truncate text-[#5865F2] text-sm hover:underline"
											>
												{item.website}
												<ExternalLink className="h-3 w-3 flex-shrink-0" />
											</a>
										) : (
											<p className="mt-1 text-gray-400 text-sm">無</p>
										)}
									</div>
								</>
							) : (
								<div>
									<h4 className="font-medium text-gray-400 text-sm">成員數</h4>
									<div className="mt-1 flex items-center gap-1 text-sm">
										<Users className="h-4 w-4 text-gray-400" />
										<span>{item.members}</span>
									</div>
								</div>
							)}
						</div>

						{item.tags && item.tags.length > 0 && (
							<div>
								<h4 className="mb-2 font-medium text-gray-400 text-sm">
									{isBot ? "標籤" : "分類"}
								</h4>
								<div className="flex flex-wrap gap-2">
									{item.tags.map((tag) => (
										<Badge
											key={tag}
											className="bg-[#5865f2] text-xs hover:bg-[#4752c4] sm:text-sm"
										>
											{tag}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="mt-4 flex flex-col-reverse justify-end gap-2 sm:flex-row">
						<Button
							variant="outline"
							className="w-full border-[#4E5058] text-white hover:bg-[#4E5058] sm:w-auto"
							onClick={onClose}
						>
							關閉
						</Button>
						<Button
							className="w-full bg-[#ED4245] hover:bg-[#ED4245]/90 sm:w-auto"
							onClick={() => {
								onDelete(item);
								onClose();
							}}
						>
							<Trash2 className="mr-1 h-4 w-4" /> 刪除
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
				<DialogContent className="max-w-[95vw] border-[#202225] bg-[#36393F] text-white sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
							<AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#ED4245] sm:h-5 sm:w-5" />
							確認刪除
						</DialogTitle>
						<DialogDescription className="text-gray-400 text-sm">
							此操作無法撤銷。
						</DialogDescription>
					</DialogHeader>
					<p className="break-words py-4 text-sm sm:text-base">
						您確定要刪除{item.kind === "bot" ? "機器人" : "伺服器"}{" "}
						<strong>{item.name}</strong> 嗎？
					</p>
					<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
						<Button
							variant="outline"
							className="w-full border-[#4E5058] text-white hover:bg-[#4E5058] sm:w-auto"
							onClick={onClose}
						>
							取消
						</Button>
						<Button
							className="w-full bg-[#ED4245] hover:bg-[#ED4245]/90 sm:w-auto"
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
	<div className="py-8 text-center text-gray-400 sm:py-12">
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
			// also close detail dialog if the deleted item was open there
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
		<Card className="border-[#202225] bg-[#2F3136] text-white">
			<CardHeader className="space-y-2 sm:space-y-1.5">
				<CardTitle className="flex items-center gap-2 font-bold text-lg sm:text-xl">
					<Server className="h-4 w-4 flex-shrink-0 text-[#5865F2] sm:h-5 sm:w-5" />
					機器人和伺服器管理
				</CardTitle>
				<CardDescription className="text-gray-400 text-sm">
					管理所有已批准的機器人和已連接的伺服器
				</CardDescription>
			</CardHeader>

			<CardContent className="p-4 sm:p-6">
				<div className="space-y-4">
					<div className="relative">
						<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
						<Input
							placeholder="搜尋機器人或伺服器..."
							className="border-[#1E1F22] bg-[#202225] pl-9 text-sm text-white placeholder:text-gray-400 focus-visible:ring-[#5865F2] sm:text-base"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>

					<Tabs
						value={activeTab}
						onValueChange={(v) => setActiveTab(v as "bots" | "servers")}
						className="space-y-4"
					>
						<TabsList className="grid h-auto w-full grid-cols-2 bg-[#202225] p-1 text-white">
							<TabsTrigger
								value="bots"
								className="py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
							>
								<Bot className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" /> 機器人
							</TabsTrigger>
							<TabsTrigger
								value="servers"
								className="py-2 text-sm data-[state=active]:bg-[#5865F2] data-[state=active]:text-white sm:text-base"
							>
								<Server className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" /> 伺服器
							</TabsTrigger>
						</TabsList>

						<TabsContent value="bots" className="mt-4">
							{filteredBots.length === 0 ? (
								<EmptyState
									message={search ? "沒有符合搜尋的機器人" : "沒有找到機器人"}
								/>
							) : (
								<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
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

						<TabsContent value="servers" className="mt-4">
							{filteredServers.length === 0 ? (
								<EmptyState
									message={search ? "沒有符合搜尋的伺服器" : "沒有找到伺服器"}
								/>
							) : (
								<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
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
