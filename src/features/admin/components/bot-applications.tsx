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
	updateBotServerCountBackground,
} from "../admin.functions";
import { sendDiscordWebhook } from "../webhook.functions";
import RejectBotDialog from "./reject-bot-dialog";

// ── Constants ──────────────────────────────────────────────

const STATUS_CONFIG = {
	pending: { label: "待處理", className: "bg-[#FEE75C] text-black" },
	approved: { label: "已批准", className: "bg-[#57F287]" },
	rejected: { label: "已拒絕", className: "bg-red-700" },
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
		<Badge className={`${cfg.className} whitespace-nowrap text-xs sm:text-sm`}>
			{cfg.label}
		</Badge>
	);
});
StatusBadge.displayName = "StatusBadge";

const TagList = memo(
	({ tags, max = 5 }: { tags: readonly string[]; max?: number }) => (
		<div className="flex flex-wrap gap-1 overflow-hidden">
			{tags.slice(0, max).map((tag) => (
				<Badge
					key={tag}
					variant="outline"
					className="whitespace-nowrap border-none bg-[#4E5058] text-xs"
				>
					{tag}
				</Badge>
			))}
			{tags.length > max && (
				<Badge variant="outline" className="border-none bg-[#4E5058] text-xs">
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
			className="flex h-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-md border border-[#202225] bg-[#36393F] p-3 transition-all duration-200 hover:border-[#5865F2] hover:shadow-lg sm:p-4"
		>
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="line-clamp-1 flex-1 break-words font-semibold text-sm sm:text-base">
						{app.name}
					</h3>
					<StatusBadge status={app.status} />
				</div>

				<div className="space-y-1 break-words text-gray-400 text-xs sm:text-sm">
					<p>
						<span className="font-medium text-white">提交者：</span>
						{app.developers.map((d) => d.username).join(", ")}
					</p>
					<p className="text-xs">{formatDate(app.createdAt)}</p>
				</div>

				<p className="line-clamp-2 break-words text-gray-300 text-xs sm:text-sm">
					{app.description}
				</p>

				{app.tags && <TagList tags={app.tags} />}
			</div>

			{app.status === "pending" && (
				<div className="mt-2 flex w-full flex-wrap gap-2">
					<Button
						size="sm"
						className="min-w-[80px] flex-1 cursor-pointer bg-[#57F287] text-black hover:bg-[#57F287]/90"
						onClick={(e) => {
							e.stopPropagation();
							onApprove();
						}}
					>
						<Check className="mr-1 h-4 w-4" /> 批准
					</Button>
					<Button
						asChild
						size="sm"
						className="min-w-[80px] flex-1"
						onClick={(e) => e.stopPropagation()}
					>
						<Link
							to={app.inviteUrl ?? ""}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Link2 className="mr-1 h-4 w-4" /> 邀請
						</Link>
					</Button>
					<Button
						size="sm"
						className="min-w-20 flex-1 cursor-pointer bg-red-700/80 hover:bg-red-700"
						onClick={(e) => {
							e.stopPropagation();
							onReject();
						}}
					>
						<X className="mr-1 h-4 w-4" /> 拒絕
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
				<DialogContent className="max-h-[90vh] max-w-3xl overflow-auto border-[#202225] bg-[#36393F] text-white">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
							<Bot className="h-5 w-5 flex-shrink-0 text-[#5865F2]" />
							<span className="break-words">{app.name}</span>
						</DialogTitle>
						<DialogDescription className="text-gray-400">
							機器人應用詳情
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<h4 className="mb-1 font-medium text-gray-400 text-sm">
									開發者
								</h4>
								<ul className="ml-4 list-disc text-sm">
									{app.developers.map((d) => (
										<li key={d.id} className="break-words">
											{d.username}
										</li>
									))}
								</ul>
							</div>
							<div>
								<h4 className="mb-1 font-medium text-gray-400 text-sm">
									提交時間
								</h4>
								<p className="text-sm">{formatDate(app.createdAt)}</p>
							</div>
						</div>

						{app.longDescription && (
							<div>
								<h4 className="mb-1 font-medium text-gray-400 text-sm">
									詳細描述
								</h4>
								<div className="max-h-64 overflow-y-auto rounded-md bg-[#2F3136] p-3 text-sm">
									<MarkdownRenderer content={app.longDescription} />
								</div>
							</div>
						)}

						{app.tags && app.tags.length > 0 && (
							<div>
								<h4 className="mb-2 font-medium text-gray-400 text-sm">標籤</h4>
								<TagList tags={app.tags} max={20} />
							</div>
						)}

						{app.screenshots && app.screenshots.length > 0 && (
							<div>
								<h4 className="mb-2 font-medium text-gray-400 text-sm">截圖</h4>
								<div className="grid grid-cols-2 gap-2">
									{app.screenshots.map((url) => (
										<img
											key={url}
											src={url}
											alt="截圖"
											className="w-full rounded-md object-cover"
											loading="lazy"
										/>
									))}
								</div>
							</div>
						)}
					</div>

					{app.status === "pending" && (
						<div className="flex flex-col justify-end gap-2 sm:flex-row">
							<Button
								className="bg-[#57F287] text-black hover:bg-[#57F287]/90"
								onClick={onApprove}
							>
								<Check className="mr-1 h-4 w-4" /> 批准
							</Button>
							<Button asChild className="border-[#4E5058]">
								<Link
									to={app.inviteUrl ?? ""}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Link2 className="mr-1 h-4 w-4" /> 邀請連結
								</Link>
							</Button>
							<Button
								className="bg-red-700/80 hover:bg-red-700"
								onClick={onReject}
							>
								<X className="mr-1 h-4 w-4" /> 拒絕
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
			void updateBotServerCountBackground(app.id).catch((error) => {
				console.error("[背景更新伺服器數量失敗] approvedBot:", error);
			});
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
			<Card className="border-[#202225] bg-[#2F3136] text-white">
				<CardHeader className="space-y-2">
					<CardTitle className="flex items-center gap-2 font-bold text-lg sm:text-xl">
						<Bot className="h-5 w-5 flex-shrink-0 text-[#5865F2]" />
						機器人應用
					</CardTitle>
					<CardDescription className="text-gray-400 text-sm">
						審核和管理待處理的機器人應用
					</CardDescription>
				</CardHeader>

				<CardContent>
					<div className="space-y-4">
						<div className="relative">
							<Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
							<Input
								placeholder="搜尋應用..."
								className="border-[#1E1F22] bg-[#202225] pl-9 text-white placeholder:text-gray-400 focus-visible:ring-[#5865F2]"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>

						{filtered.length === 0 ? (
							<div className="py-12 text-center text-gray-400">
								<Bot className="mx-auto mb-3 h-12 w-12 opacity-50" />
								<p>{search ? "沒有符合搜尋的應用" : "沒有待處理的應用"}</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
