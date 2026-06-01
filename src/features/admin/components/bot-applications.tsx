// ============================================================
// components/bot-applications.tsx
// ============================================================

import { Link } from "@tanstack/react-router";
import { Bot, Check, Link2, Search, X } from "lucide-react";
import { memo, useCallback } from "react";
import MarkdownRenderer from "#/components/MarkdownRenderer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { useBotApplications } from "#/hooks/use-bot-applications";
import { useDialog } from "#/hooks/use-dialog";
import { showErrorAlert } from "#/lib/error-alert";
import type { Bot as BotType } from "@/types/admin";
import {
	sendNotification,
	updateBotServerCountBackgroundFn,
} from "../admin.functions";
import { sendDiscordWebhook } from "../webhook.functions";
import RejectBotDialog from "./reject-bot-dialog";

// ── Constants ──────────────────────────────────────────────

// [修改] 為 Badge 加上漸層色彩與文字陰影，提升現代感與對比度
const STATUS_CONFIG = {
	pending: {
		label: "待處理",
		className:
			"bg-gradient-to-r from-[#FEE75C] to-[#e6d045] text-black shadow-sm font-semibold",
	},
	approved: {
		label: "已批准",
		className:
			"bg-gradient-to-r from-[#57F287] to-[#45d16f] text-black shadow-sm font-semibold",
	},
	rejected: {
		label: "已拒絕",
		className:
			"bg-gradient-to-r from-red-600 to-red-800 text-white shadow-sm font-semibold",
	},
} as const satisfies Record<
	BotType["status"],
	{ label: string; className: string }
>;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
};
const formatDate = (d: Date | string | null) =>
	d ? new Date(d).toLocaleString("zh-TW", DATE_FORMAT) : "—";

// ── Leaf components (no hooks → no memo overhead needed) ───

const StatusBadge = memo(({ status }: { status: BotType["status"] }) => {
	const cfg = STATUS_CONFIG[status];
	return (
		// [修改] 加入 border-none 避免預設邊框干擾漸層
		<Badge
			className={`${cfg.className} whitespace-nowrap border-none text-xs sm:text-sm transition-all duration-200`}
		>
			{cfg.label}
		</Badge>
	);
});
StatusBadge.displayName = "StatusBadge";

const TagList = memo(
	({ tags, max = 5 }: { tags: readonly string[]; max?: number }) => (
		<div className="flex flex-wrap gap-1.5 overflow-hidden">
			{tags.slice(0, max).map((tag) => (
				<Badge
					key={tag}
					variant="outline"
					// [修改] 增加半透明背景、hover狀態、過渡動畫，讓標籤更生動
					className="whitespace-nowrap border-none bg-[#4E5058]/80 text-gray-200 text-xs transition-colors hover:bg-[#4E5058] hover:text-white"
				>
					{tag}
				</Badge>
			))}
			{tags.length > max && (
				<Badge
					variant="outline"
					className="border-none bg-[#4E5058]/60 text-gray-300 text-xs transition-colors hover:bg-[#4E5058]/80"
				>
					+{tags.length - max}
				</Badge>
			)}
		</div>
	),
);
TagList.displayName = "TagList";

// ── ApplicationCard ────────────────────────────────────────

const ApplicationCard = memo(
	({
		app,
		onView,
		onApprove,
		onReject,
	}: {
		app: BotType;
		onView: () => void;
		onApprove: () => void;
		onReject: () => void;
	}) => (
		// biome-ignore lint/a11y/useSemanticElements: The entire card is clickable, so using a div with role="button" is more appropriate here.
		<div
			onClick={onView}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onView();
				}
			}}
			role="button"
			tabIndex={0}
			// [修改] 加入 group、圓角加大(rounded-xl)、Z軸浮動(hover:-translate-y-1)、陰影強化(hover:shadow-2xl)、點擊反饋(active:scale-[0.98])、鍵盤聚焦狀態(focus-visible)
			className="group flex h-full cursor-pointer flex-col justify-between gap-4 overflow-hidden rounded-xl border border-[#202225] bg-[#36393F] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#5865F2]/50 hover:shadow-2xl hover:shadow-[#5865F2]/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] sm:p-5"
		>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					{/* [修改] 卡片懸浮時，標題帶有品牌色的漸層變化 */}
					<h3 className="line-clamp-1 flex-1 break-words font-bold text-gray-100 text-base transition-colors duration-300 group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-[#5865F2] group-hover:bg-clip-text group-hover:text-transparent sm:text-lg">
						{app.name}
					</h3>
					<StatusBadge status={app.status} />
				</div>

				{/* [修改] 調整文字層級，讓提交者與時間有更好的明暗區分 */}
				<div className="space-y-1.5 break-words text-xs sm:text-sm">
					<p className="text-gray-300">
						<span className="font-medium text-gray-400">提交者：</span>
						<span className="font-medium text-white">
							{app.developers.map((d) => d.username).join(", ")}
						</span>
					</p>
					<p className="text-gray-500 text-xs font-medium">
						{formatDate(app.createdAt)}
					</p>
				</div>

				<p className="line-clamp-2 break-words text-gray-400 text-sm leading-relaxed sm:text-sm">
					{app.description}
				</p>

				{app.tags && (
					<div className="pt-1">
						<TagList tags={app.tags} />
					</div>
				)}
			</div>

			{app.status === "pending" && (
				// [修改] 將按鈕區塊加入 border-t 分隔，並設定按鈕的漸層、hover 發亮、active 點擊縮放效果
				<div className="mt-2 flex w-full flex-wrap gap-2 pt-3 border-t border-[#202225]">
					<Button
						size="sm"
						className="min-w-[80px] flex-1 cursor-pointer border-none bg-gradient-to-r from-[#57F287] to-[#45d16f] text-black shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95"
						onClick={(e) => {
							e.stopPropagation();
							onApprove();
						}}
					>
						<Check className="mr-1.5 h-4 w-4" /> 批准
					</Button>
					<Button
						asChild
						size="sm"
						className="min-w-[80px] flex-1 cursor-pointer border-none bg-gradient-to-r from-discord to-[#4752C4] text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95"
						onClick={(e) => e.stopPropagation()}
					>
						<Link
							to={app.inviteUrl ?? ""}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Link2 className="mr-1.5 h-4 w-4" /> 邀請
						</Link>
					</Button>
					<Button
						size="sm"
						className="min-w-20 flex-1 cursor-pointer border-none bg-gradient-to-r from-red-600 to-red-800 text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95"
						onClick={(e) => {
							e.stopPropagation();
							onReject();
						}}
					>
						<X className="mr-1.5 h-4 w-4" /> 拒絕
					</Button>
				</div>
			)}
		</div>
	),
);
ApplicationCard.displayName = "ApplicationCard";

// ── Detail dialog ──────────────────────────────────────────

const ApplicationDetailDialog = memo(
	({
		app,
		isOpen,
		onClose,
		onApprove,
		onReject,
	}: {
		app: BotType | null;
		isOpen: boolean;
		onClose: () => void;
		onApprove: () => void;
		onReject: () => void;
	}) => {
		if (!app) return null;
		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				{/* [修改] 替換成 rounded-xl 並增加 shadow，背景維持原有深色 */}
				<DialogContent className="max-h-[90vh] max-w-3xl overflow-auto rounded-xl border border-[#202225] bg-[#36393F] text-white shadow-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 font-bold text-xl sm:text-2xl">
							<Bot className="h-6 w-6 flex-shrink-0 text-[#5865F2]" />
							<span className="break-words bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
								{app.name}
							</span>
						</DialogTitle>
						<DialogDescription className="text-gray-400">
							機器人應用詳情
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-6 py-4">
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
							<div className="space-y-1.5">
								<h4 className="font-semibold text-[#5865F2] text-sm uppercase tracking-wider">
									開發者
								</h4>
								<ul className="ml-4 list-disc text-gray-200 text-sm marker:text-[#5865F2]">
									{app.developers.map((d) => (
										<li key={d.id} className="break-words font-medium">
											{d.username}
										</li>
									))}
								</ul>
							</div>
							<div className="space-y-1.5">
								<h4 className="font-semibold text-[#5865F2] text-sm uppercase tracking-wider">
									提交時間
								</h4>
								<p className="text-gray-200 text-sm font-medium">
									{formatDate(app.createdAt)}
								</p>
							</div>
						</div>

						{app.longDescription && (
							<div className="space-y-1.5">
								<h4 className="font-semibold text-[#5865F2] text-sm uppercase tracking-wider">
									詳細描述
								</h4>
								{/* [修改] 增加內陰影(shadow-inner)與極簡外框 */}
								<div className="max-h-64 overflow-y-auto rounded-lg border border-[#202225] bg-[#2F3136] p-4 text-gray-200 text-sm shadow-inner">
									<MarkdownRenderer content={app.longDescription} />
								</div>
							</div>
						)}

						{app.tags && app.tags.length > 0 && (
							<div className="space-y-2">
								<h4 className="font-semibold text-[#5865F2] text-sm uppercase tracking-wider">
									標籤
								</h4>
								<TagList tags={app.tags} max={20} />
							</div>
						)}

						{app.screenshots && app.screenshots.length > 0 && (
							<div className="space-y-2">
								<h4 className="font-semibold text-[#5865F2] text-sm uppercase tracking-wider">
									截圖
								</h4>
								<div className="grid grid-cols-2 gap-3 sm:gap-4">
									{app.screenshots.map((url) => (
										// [修改] 為圖片增加 group 與 hover 放大的轉場效果
										<div
											key={url}
											className="group overflow-hidden rounded-lg border border-[#202225] bg-black/50"
										>
											<img
												src={url}
												alt="截圖"
												className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
												loading="lazy"
											/>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					{app.status === "pending" && (
						// [修改] Dialog 內的按鈕同樣套用漸層、交互動畫
						<div className="flex flex-col justify-end gap-3 border-t border-[#202225] pt-4 sm:flex-row">
							<Button
								className="border-none bg-gradient-to-r from-[#57F287] to-[#45d16f] text-black shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95"
								onClick={onApprove}
							>
								<Check className="mr-1.5 h-4 w-4" /> 批准
							</Button>
							<Button
								asChild
								className="border border-[#4E5058] bg-discord text-white shadow-sm transition-all duration-200 hover:bg-discord-hover active:scale-95"
							>
								<Link
									to={app.inviteUrl ?? ""}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Link2 className="mr-1.5 h-4 w-4" /> 邀請連結
								</Link>
							</Button>
							<Button
								className="border-none bg-gradient-to-r from-red-600 to-red-800 text-white shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95"
								onClick={onReject}
							>
								<X className="mr-1.5 h-4 w-4" /> 拒絕
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>
		);
	},
);
ApplicationDetailDialog.displayName = "ApplicationDetailDialog";

// ── Main component ─────────────────────────────────────────

export default function BotApplications({
	applications,
}: {
	applications: readonly BotType[];
}) {
	const { filtered, search, setSearch, review } = useBotApplications({
		initial: applications,
		onError: showErrorAlert,
	});
	const detailDialog = useDialog<BotType>();
	const rejectDialog = useDialog<BotType>();

	const handleApprove = useCallback(
		async (app: BotType) => {
			const ok = await review(app.id, "approved");
			if (!ok) return;

			// Fire-and-forget background tasks
			void Promise.all(
				app.developers.map((dev) =>
					sendNotification({
						subject: "您的機器人申請已通過 ✅",
						teaser: `${app.name} 已通過審核`,
						content: `您好！機器人「${app.name}」已核准上架，感謝耐心等待。`,
						priority: "success",
						userIds: [dev.id],
					}),
				),
			).catch(() => {});
			void sendDiscordWebhook({
				data: {
					_tag: "approvedBot",
					bot: {
						id: app.id,
						name: app.name,
						prefix: app.prefix,
						description: app.description,
						developers: app.developers,
						inviteUrl: app.inviteUrl,
						tags: app.tags,
						icon: app.icon,
						banner: app.banner,
					},
				},
			}).catch((error) => {
				console.error("[Webhook 背景發送失敗] approvedBot:", error);
			});
			void updateBotServerCountBackgroundFn({ data: { botId: app.id } }).catch(
				(error) => {
					console.error("[背景更新伺服器數量失敗] approvedBot:", error);
				},
			);
		},
		[review],
	);

	const handleReject = useCallback(
		async (id: string, reason: string) => {
			const app = rejectDialog.item;
			if (!app) return;
			const ok = await review(id, "rejected", reason);
			if (!ok) return;
			rejectDialog.close();

			void Promise.all(
				app.developers.map((dev) =>
					sendNotification({
						subject: "您的機器人申請未通過 ❌",
						teaser: `${app.name} 的申請未被接受`,
						content: `您好，機器人「${app.name}」未通過審核。\n\n拒絕原因：${reason}`,
						priority: "warning",
						userIds: [dev.id],
					}),
				),
			).catch(() => {});
		},
		[review, rejectDialog],
	);

	return (
		<>
			{/* [修改] 保持背景色，加大圓角與陰影呈現 */}
			<Card className="rounded-xl border border-[#202225] bg-[#2F3136] text-white shadow-xl">
				<CardHeader className="space-y-2 border-b border-[#202225] pb-6">
					<CardTitle className="flex items-center gap-2 font-bold text-xl sm:text-2xl">
						<Bot className="h-6 w-6 flex-shrink-0 text-[#5865F2]" />
						<span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
							機器人應用
						</span>
					</CardTitle>
					<CardDescription className="text-gray-400 text-sm font-medium">
						審核和管理待處理的機器人應用
					</CardDescription>
				</CardHeader>

				<CardContent className="pt-6">
					<div className="space-y-6">
						{/* [修改] 搜尋框包裝層：加入 focus-within 發光效果 */}
						<div className="group relative rounded-md transition-all duration-300 focus-within:shadow-[0_0_15px_rgba(88,101,242,0.2)]">
							{/* [修改] icon 在獲得焦點時變色 */}
							<Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-gray-500 transition-colors duration-200 group-focus-within:text-[#5865F2]" />
							<Input
								placeholder="搜尋應用..."
								className="h-10 border border-[#1E1F22] bg-[#202225] pl-10 text-white placeholder:text-gray-500 transition-all focus-visible:border-[#5865F2]/50 focus-visible:ring-1 focus-visible:ring-[#5865F2]"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>

						{filtered.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
								<Bot className="mb-4 h-16 w-16 opacity-30 transition-opacity duration-300 hover:opacity-50" />
								<p className="text-lg font-medium">
									{search ? "沒有符合搜尋的應用" : "沒有待處理的應用"}
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
								{filtered.map((app) => (
									<ApplicationCard
										key={app.id}
										app={app}
										onView={() => detailDialog.open(app)}
										onApprove={() => handleApprove(app)}
										onReject={() => rejectDialog.open(app)}
									/>
								))}
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			<ApplicationDetailDialog
				app={detailDialog.item}
				isOpen={detailDialog.isOpen}
				onClose={detailDialog.close}
				onApprove={() => detailDialog.item && handleApprove(detailDialog.item)}
				onReject={() =>
					detailDialog.item && rejectDialog.open(detailDialog.item)
				}
			/>

			{rejectDialog.item && (
				<RejectBotDialog
					botId={rejectDialog.item.id}
					botName={rejectDialog.item.name}
					userIds={rejectDialog.item.developers}
					isOpen={rejectDialog.isOpen}
					onClose={rejectDialog.close}
					onConfirm={handleReject}
				/>
			)}
		</>
	);
}
