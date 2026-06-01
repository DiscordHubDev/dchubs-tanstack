// ============================================================
// components/report-inbox.tsx
// ============================================================

import {
	AlertCircle,
	AlertTriangle,
	Bot,
	Check,
	Flag,
	Flame,
	Info,
	Paperclip,
	Search,
	Server,
	User,
	X,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import AttachmentPreview from "#/features/admin/components/ReportAttachmentPreview";
import { ResolveDialog } from "#/features/admin/components/ReportResolveDialog";
import { useDialog } from "#/hooks/use-dialog";
import { useReportInbox } from "#/hooks/use-report-inbox";
import type {
	Report,
	ReportSeverity,
	ReportStatus,
	SeverityLevel,
} from "@/types/admin";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

// ── Constants ──────────────────────────────────────────────

const SEVERITY_LEVELS: readonly SeverityLevel[] = [
	{ value: "untagged", label: "未標記", color: "gray", icon: AlertCircle },
	{ value: "low", label: "低", color: "green", icon: Info },
	{ value: "moderate", label: "中", color: "yellow", icon: AlertTriangle },
	{ value: "severe", label: "高", color: "red", icon: Flame },
] as const;

const SEVERITY_MAP = new Map(SEVERITY_LEVELS.map((s) => [s.value, s]));
const getSeverityInfo = (v: ReportSeverity) =>
	SEVERITY_MAP.get(v) ?? SEVERITY_LEVELS[3];

const STATUS_BADGE: Record<ReportStatus, { label: string; className: string }> =
	{
		pending: { label: "待處理", className: "bg-[#FEE75C] text-black" },
		resolved: { label: "已採取動作", className: "bg-[#57F287]" },
		rejected: { label: "已駁回", className: "bg-[#ED4245]" },
	};

// ── Shared helpers ─────────────────────────────────────────

const formatDate = (d: Date | string) => new Date(d).toLocaleString("zh-TW");

// ── SeverityBadge ──────────────────────────────────────────

const SeverityBadge = memo(({ severity }: { severity: ReportSeverity }) => {
	const info = getSeverityInfo(severity);
	const Icon = info.icon;
	return (
		<Badge
			variant="outline"
			className="flex items-center gap-1 border-none"
			style={{
				backgroundColor: info.color,
				color: info.value === "moderate" ? "black" : "white",
			}}
		>
			<Icon className="h-3 w-3" />
			{info.label}
		</Badge>
	);
});
SeverityBadge.displayName = "SeverityBadge";

// ── ReportRow ──────────────────────────────────────────────

const ReportRow = memo(
	({
		report,
		onView,
		onResolve,
		onReject,
	}: {
		report: Report;
		onView: (r: Report) => void;
		onResolve: (r: Report) => void;
		onReject: (r: Report) => void;
	}) => {
		const statusCfg = STATUS_BADGE[report.status];
		const isPending = report.status === "pending";

		return (
			// biome-ignore lint/a11y/useSemanticElements: This is a complex card with a nested delete button, so a native button cannot be used here.
			<div
				className="cursor-pointer rounded-md border border-[#202225] bg-[#36393F] p-3 transition-colors hover:border-[#5865F2] sm:p-4"
				onClick={() => onView(report)}
				// --- 以下是為了解決 Linter 報錯新增的部分 ---
				onKeyDown={(e) => {
					// 支援使用 Enter 鍵或空白鍵觸發卡片點擊
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault(); // 重要：防止按空白鍵時網頁自動向下捲動
						onView(report);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="line-clamp-1 flex-1 break-words font-semibold text-sm sm:text-base">
								{report.subject}
							</h3>
							<Badge className={statusCfg.className}>{statusCfg.label}</Badge>
							<SeverityBadge severity={report.severity} />
						</div>
						<div className="flex flex-wrap items-center gap-2 text-gray-400 text-xs">
							<span className="flex items-center gap-1">
								<User className="h-3 w-3" /> {report.reportedBy.username}
							</span>
							<span className="flex items-center gap-1">
								{report.type === "bot" ? (
									<Bot className="h-3 w-3" />
								) : (
									<Server className="h-3 w-3" />
								)}
								{report.itemName}
							</span>
							{report.attachments.length > 0 && (
								<span className="flex items-center gap-1">
									<Paperclip className="h-3 w-3" /> {report.attachments.length}
								</span>
							)}
							<span>{formatDate(report.reportedAt)}</span>
						</div>
					</div>

					{isPending && (
						// biome-ignore lint/a11y/useSemanticElements: This is a complex card with a nested delete button, so a native button cannot be used here.
						<div
							className="flex flex-shrink-0 gap-2"
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
								}
							}}
							role="button"
							tabIndex={0}
						>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											className="bg-[#57F287] text-black hover:bg-[#57F287]/90"
											onClick={() => onResolve(report)}
										>
											<Check className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>採取行動</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											className="bg-[#ED4245] hover:bg-[#ED4245]/90"
											onClick={() => onReject(report)}
										>
											<X className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>駁回檢舉</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					)}
				</div>
			</div>
		);
	},
);
ReportRow.displayName = "ReportRow";

// ── Report detail dialog ───────────────────────────────────

const ReportDetailDialog = memo(
	({
		report,
		isOpen,
		onClose,
		onStatusChange,
		onSeverityChange,
	}: {
		report: Report | null;
		isOpen: boolean;
		onClose: () => void;
		onStatusChange: (id: string, status: ReportStatus) => void;
		onSeverityChange: (id: string, severity: ReportSeverity) => void;
	}) => {
		if (!report) return null;
		const statusCfg = STATUS_BADGE[report.status];

		return (
			<Dialog open={isOpen} onOpenChange={onClose}>
				<DialogContent className="max-h-[90vh] max-w-3xl overflow-auto border-[#202225] bg-[#36393F] text-white">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							<Flag className="h-5 w-5 text-[#5865F2]" /> 檢舉詳情
						</DialogTitle>
						<DialogDescription className="text-gray-400">
							查看完整檢舉信息
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="break-words font-semibold text-lg">
										{report.subject}
									</h3>
									<Badge className={statusCfg.className}>
										{statusCfg.label}
									</Badge>
									<SeverityBadge severity={report.severity} />
								</div>
								<p className="mt-1 text-gray-400 text-sm">
									檢舉時間 {formatDate(report.reportedAt)}
								</p>
							</div>

							{report.status !== "pending" && (
								<div className="min-w-[200px] text-gray-400 text-xs sm:text-sm">
									<p>
										此檢舉由{" "}
										<strong>
											{report.handledBy?.username ?? "未知管理員"}
										</strong>{" "}
										已於{" "}
										<strong>
											{report.handledAt ? formatDate(report.handledAt) : "—"}
										</strong>{" "}
										處理。
									</p>
									{report.resolutionNote && (
										<p className="mt-1">
											<span className="font-medium">處理說明：</span>
											<span className="text-muted-foreground">
												{report.resolutionNote}
											</span>
										</p>
									)}
								</div>
							)}
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<h4 className="font-medium text-gray-400 text-sm">檢舉者</h4>
								<div className="mt-1 flex items-center gap-1">
									<User className="h-4 w-4 text-gray-400" />
									<span className="break-words">
										{report.reportedBy.username}
									</span>
								</div>
							</div>
							<div>
								<h4 className="font-medium text-gray-400 text-sm">檢舉項目</h4>
								<div className="mt-1 flex items-center gap-1">
									{report.type === "bot" ? (
										<Bot className="h-4 w-4 text-gray-400" />
									) : (
										<Server className="h-4 w-4 text-gray-400" />
									)}
									<span className="break-words">
										{report.itemName} (
										{report.type === "bot" ? "機器人" : "伺服器"})
									</span>
								</div>
							</div>
						</div>

						<div>
							<h4 className="font-medium text-gray-400 text-sm">檢舉內容</h4>
							<div className="mt-2 whitespace-pre-wrap break-words rounded-md bg-[#2F3136] p-3 text-sm">
								{report.content}
							</div>
						</div>

						{report.attachments.length > 0 && (
							<div>
								<h4 className="font-medium text-gray-400 text-sm">附件</h4>
								<div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
									{report.attachments.map((a) => (
										<AttachmentPreview key={a.public_id} attachment={a} />
									))}
								</div>
							</div>
						)}
					</div>

					<DialogFooter className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
						<Select
							value={report.severity}
							onValueChange={(v) =>
								onSeverityChange(report.id, v as ReportSeverity)
							}
						>
							<SelectTrigger className="w-full border-[#1E1F22] bg-[#202225] text-white focus:ring-[#5865F2] sm:w-[180px]">
								<SelectValue placeholder="設置嚴重程度" />
							</SelectTrigger>
							<SelectContent className="border-[#202225] bg-[#2F3136] text-white">
								{SEVERITY_LEVELS.map((level) => {
									const Icon = level.icon;
									return (
										<SelectItem key={level.value} value={level.value}>
											<div className="flex items-center gap-2">
												<Icon
													className="h-4 w-4"
													style={{ color: level.color }}
												/>
												{level.label}
											</div>
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>

						{report.status === "pending" && (
							<div className="flex w-full gap-2 sm:w-auto">
								<Button
									className="flex-1 bg-[#57F287] text-black hover:bg-[#57F287]/90 sm:flex-none"
									onClick={() => onStatusChange(report.id, "resolved")}
								>
									<Check className="mr-1 h-4 w-4" /> 接受檢舉
								</Button>
								<Button
									className="flex-1 bg-[#ED4245] hover:bg-[#ED4245]/90 sm:flex-none"
									onClick={() => onStatusChange(report.id, "rejected")}
								>
									<X className="mr-1 h-4 w-4" /> 駁回檢舉
								</Button>
							</div>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	},
);
ReportDetailDialog.displayName = "ReportDetailDialog";

// ── Main component ─────────────────────────────────────────

export default function ReportInbox({
	reports: initial,
}: {
	reports: readonly Report[];
}) {
	const {
		filtered,
		pendingCount,
		search,
		setSearch,
		statusFilter,
		setStatusFilter,
		severityFilter,
		setSeverityFilter,
		changeStatus,
		changeSeverity,
	} = useReportInbox({ initial });

	const detailDialog = useDialog<Report>();
	const [resolveInfo, setResolveInfo] = useState<{
		report: Report;
		status: ReportStatus;
	} | null>(null);

	const handleStatusChange = useCallback(
		async (id: string, status: ReportStatus) => {
			const report = filtered.find((r) => r.id === id) ?? detailDialog.item;
			if (!report) return;
			const ok = await changeStatus(id, status);
			if (ok) setResolveInfo({ report: { ...report, status }, status });
		},
		[filtered, detailDialog.item, changeStatus],
	);

	return (
		<Card className="border-[#202225] bg-[#2F3136] text-white">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 font-bold text-xl">
					<Flag className="h-5 w-5 text-[#5865F2]" />
					檢舉收件匣
					{pendingCount > 0 && (
						<span className="ml-2 rounded-full bg-[#ED4245] px-2 py-0.5 text-xs">
							{pendingCount}
						</span>
					)}
				</CardTitle>
				<CardDescription className="text-gray-400">
					審核和管理用戶檢舉
				</CardDescription>
			</CardHeader>

			<CardContent>
				<div className="space-y-4">
					{/* Filters */}
					<div className="flex flex-col gap-2 sm:flex-row">
						<div className="relative flex-1">
							<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
							<Input
								placeholder="搜尋檢舉..."
								className="border-[#1E1F22] bg-[#202225] pl-9 text-white placeholder:text-gray-400 focus-visible:ring-[#5865F2]"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<Select
							value={statusFilter}
							onValueChange={(v) => setStatusFilter(v as ReportStatus | "all")}
						>
							<SelectTrigger className="w-full border-[#1E1F22] bg-[#202225] text-white sm:w-[140px]">
								<SelectValue placeholder="狀態" />
							</SelectTrigger>
							<SelectContent className="border-[#202225] bg-[#2F3136] text-white">
								<SelectItem value="all">全部狀態</SelectItem>
								<SelectItem value="pending">待處理</SelectItem>
								<SelectItem value="resolved">已採取動作</SelectItem>
								<SelectItem value="rejected">已駁回</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={severityFilter}
							onValueChange={(v) =>
								setSeverityFilter(v as ReportSeverity | "all")
							}
						>
							<SelectTrigger className="w-full border-[#1E1F22] bg-[#202225] text-white sm:w-[140px]">
								<SelectValue placeholder="嚴重程度" />
							</SelectTrigger>
							<SelectContent className="border-[#202225] bg-[#2F3136] text-white">
								<SelectItem value="all">全部程度</SelectItem>
								{SEVERITY_LEVELS.map((l) => (
									<SelectItem key={l.value} value={l.value}>
										{l.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Report list */}
					<div className="space-y-2">
						{filtered.length === 0 ? (
							<div className="py-12 text-center text-gray-400">
								<Flag className="mx-auto mb-3 h-12 w-12 opacity-50" />
								<p>{search ? "沒有符合搜尋的檢舉" : "沒有找到檢舉"}</p>
							</div>
						) : (
							filtered.map((report) => (
								<ReportRow
									key={report.id}
									report={report}
									onView={detailDialog.open}
									onResolve={(r) => handleStatusChange(r.id, "resolved")}
									onReject={(r) => handleStatusChange(r.id, "rejected")}
								/>
							))
						)}
					</div>
				</div>
			</CardContent>

			<ReportDetailDialog
				report={detailDialog.item}
				isOpen={detailDialog.isOpen}
				onClose={detailDialog.close}
				onStatusChange={handleStatusChange}
				onSeverityChange={changeSeverity}
			/>

			{resolveInfo && (
				<ResolveDialog
					open={!!resolveInfo}
					onOpenChange={(isOpen) => {
						if (!isOpen) setResolveInfo(null);
					}}
					report={resolveInfo.report}
					status={resolveInfo.status}
				/>
			)}
		</Card>
	);
}
