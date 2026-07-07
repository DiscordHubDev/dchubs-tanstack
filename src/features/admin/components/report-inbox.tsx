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
import { memo, useMemo, useState } from "react";
import AttachmentPreview from "#/features/admin/components/ReportAttachmentPreview";
import { ResolveDialog } from "#/features/admin/components/ReportResolveDialog";
import { useDialog } from "#/hooks/use-dialog";
import { useReportInbox } from "#/hooks/use-report-inbox";
import type { Report, ReportSeverity, ReportStatus, SeverityLevel } from "@/types/admin";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";

// ── Constants ──────────────────────────────────────────────

const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  { value: "untagged", label: "未標記", color: "gray", icon: AlertCircle },
  { value: "low", label: "低", color: "green", icon: Info },
  { value: "moderate", label: "中", color: "yellow", icon: AlertTriangle },
  { value: "severe", label: "高", color: "red", icon: Flame },
] as const;

const SEVERITY_MAP = new Map(SEVERITY_LEVELS.map((s) => [s.value, s]));
const getSeverityInfo = (v: ReportSeverity) => SEVERITY_MAP.get(v) ?? SEVERITY_LEVELS[3];

// [調整] 替狀態標籤加入漸層色彩與陰影，增強現代感與對比度
const STATUS_BADGE: Record<ReportStatus, { label: string; className: string }> = {
  pending: {
    label: "待處理",
    className: "bg-gradient-to-r from-[#FEE75C] to-yellow-500 text-black border-none shadow-sm",
  },
  resolved: {
    label: "已採取動作",
    className: "bg-gradient-to-r from-[#57F287] to-green-500 text-black border-none shadow-sm",
  },
  rejected: {
    label: "已駁回",
    className: "bg-gradient-to-r from-[#ED4245] to-red-600 text-white border-none shadow-sm",
  },
};

// [調整] 定義嚴重程度對應的漸層與發光樣式
const SEVERITY_STYLES: Record<string, string> = {
  untagged: "bg-gradient-to-br from-gray-500 to-gray-600 text-white border-gray-400/30",
  low: "bg-gradient-to-br from-[#57F287]/80 to-green-600 text-white border-green-500/30",
  moderate: "bg-gradient-to-br from-[#FEE75C]/90 to-yellow-500 text-black border-yellow-400/30",
  severe: "bg-gradient-to-br from-[#ED4245]/90 to-red-600 text-white border-red-500/30",
};

// ── Shared helpers ─────────────────────────────────────────

const formatDate = (d: Date | string) => new Date(d).toLocaleString("zh-TW");

// ── SeverityBadge ──────────────────────────────────────────

const SeverityBadge = memo(({ severity }: { severity: ReportSeverity }) => {
  const info = getSeverityInfo(severity);
  const Icon = info.icon;
  const gradientClass = SEVERITY_STYLES[info.value] || SEVERITY_STYLES.untagged;

  return (
    <Badge
      variant="outline"
      // [調整] 使用預先定義好的漸層樣式取代 inline style，並加入微小陰影
      className={`flex items-center gap-1 border shadow-sm ${gradientClass}`}
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
      <div
        // biome-ignore lint/a11y/useSemanticElements: This is a complex card with a nested delete button, so a native button cannot be used here.
        className="group cursor-pointer rounded-xl border border-[#202225] bg-[#36393F] p-3 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#5865F2]/70 hover:shadow-[#5865F2]/10 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] active:scale-[0.99] sm:p-4"
        onClick={() => onView(report)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onView(report);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* [調整] 提升標題在 hover 時的視覺回饋（文字顏色微變） */}
              <h3 className="line-clamp-1 flex-1 break-words font-semibold text-gray-100 text-sm transition-colors group-hover:text-white sm:text-base">
                {report.subject}
              </h3>
              <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
              <SeverityBadge severity={report.severity} />
            </div>
            {/* [調整] 修改文字為 text-gray-300/400 增加層次感 */}
            <div className="flex flex-wrap items-center gap-3 font-medium text-gray-400 text-xs">
              <span className="flex items-center gap-1 text-gray-300">
                <User className="h-3.5 w-3.5" /> {report.reportedBy.username}
              </span>
              <span className="flex items-center gap-1">
                {report.type === "bot" ? (
                  <Bot className="h-3.5 w-3.5" />
                ) : (
                  <Server className="h-3.5 w-3.5" />
                )}
                {report.itemName}
              </span>
              {report.attachments.length > 0 && (
                <span className="flex items-center gap-1 text-blue-400">
                  <Paperclip className="h-3.5 w-3.5" /> {report.attachments.length}
                </span>
              )}
              <span className="opacity-80">{formatDate(report.reportedAt)}</span>
            </div>
          </div>

          {isPending && (
            <div className="mt-2 flex shrink-0 gap-2 sm:mt-0" onClick={(e) => e.stopPropagation()}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      // [調整] 套用漸層，並增加 hover brightness 與 active 縮放
                      className="border-none bg-gradient-to-r from-[#57F287] to-green-500 text-black transition-all duration-200 hover:shadow-green-500/20 hover:shadow-md hover:brightness-110 active:scale-95"
                      onClick={() => onResolve(report)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-[#1E1F22] bg-[#202225] text-gray-100">
                    採取行動
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      // [調整] 套用漸層，並增加 hover brightness 與 active 縮放
                      className="border-none bg-gradient-to-r from-[#ED4245] to-red-600 text-white transition-all duration-200 hover:shadow-md hover:shadow-red-500/20 hover:brightness-110 active:scale-95"
                      onClick={() => onReject(report)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-[#1E1F22] bg-[#202225] text-gray-100">
                    駁回檢舉
                  </TooltipContent>
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
    onStatusChange: (report: Report, status: ReportStatus) => void;
    onSeverityChange: (id: string, severity: ReportSeverity) => void;
  }) => {
    if (!report) return null;
    const statusCfg = STATUS_BADGE[report.status];

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        {/* [調整] 加入了微弱的陰影與光環邊框效果 */}
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto border-[#202225] bg-[#36393F] text-white shadow-2xl shadow-black/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-xl">
              {/* [調整] 替 icon 加上一些發光效果 */}
              <div className="rounded-full bg-[#5865F2]/10 p-1.5">
                <Flag className="h-5 w-5 text-[#5865F2]" />
              </div>
              檢舉詳情
            </DialogTitle>
            <DialogDescription className="text-gray-400">查看完整檢舉信息</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <div className="flex flex-col gap-4 rounded-xl border border-[#202225] bg-[#2F3136] p-4 sm:flex-row sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-semibold text-gray-100 text-lg">
                    {report.subject}
                  </h3>
                  <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                  <SeverityBadge severity={report.severity} />
                </div>
                <p className="font-medium text-gray-400 text-sm">
                  檢舉時間 <span className="text-gray-300">{formatDate(report.reportedAt)}</span>
                </p>
              </div>

              {report.status !== "pending" && (
                // [調整重點] 加上 shrink-0 避免變形，並設定 w-full sm:w-auto sm:max-w-[45%] 限制在大螢幕時的最大寬度，防止擠壓左側標題
                <div className="w-full shrink-0 border-[#202225] border-t pt-3 text-gray-400 text-xs sm:w-auto sm:min-w-[200px] sm:max-w-[45%] sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 sm:text-sm">
                  <p className="break-words">
                    此檢舉由{" "}
                    <strong className="text-gray-200">
                      {report.handledBy?.username ?? "未知管理員"}
                    </strong>{" "}
                    已於{" "}
                    <strong className="text-gray-200">
                      {report.handledAt ? formatDate(report.handledAt) : "—"}
                    </strong>{" "}
                    處理。
                  </p>
                  {report.resolutionNote && (
                    <p className="mt-2 break-words rounded-md bg-[#202225] p-2">
                      <span className="font-medium text-gray-300">處理說明：</span>
                      <span className="ml-1 text-gray-400">{report.resolutionNote}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <h4 className="font-medium text-gray-400 text-sm uppercase tracking-wider">
                  檢舉者
                </h4>
                <div className="flex items-center gap-2 rounded-lg border border-[#202225] bg-[#2F3136] p-2.5">
                  <div className="rounded-full bg-gray-700/50 p-1">
                    <User className="h-4 w-4 text-gray-300" />
                  </div>
                  <span className="break-words font-medium text-gray-200">
                    {report.reportedBy.username}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <h4 className="font-medium text-gray-400 text-sm uppercase tracking-wider">
                  檢舉項目
                </h4>
                <div className="flex items-center gap-2 rounded-lg border border-[#202225] bg-[#2F3136] p-2.5">
                  <div className="rounded-full bg-gray-700/50 p-1">
                    {report.type === "bot" ? (
                      <Bot className="h-4 w-4 text-gray-300" />
                    ) : (
                      <Server className="h-4 w-4 text-gray-300" />
                    )}
                  </div>
                  <span className="break-words font-medium text-gray-200">
                    {report.itemName}{" "}
                    <span className="text-gray-500">
                      ({report.type === "bot" ? "機器人" : "伺服器"})
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-medium text-gray-400 text-sm uppercase tracking-wider">
                檢舉內容
              </h4>
              {/* [調整] 增強內容區塊的閱讀體驗 */}
              <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-[#202225] bg-[#2F3136] p-4 text-gray-200 text-sm leading-relaxed shadow-inner">
                {report.content}
              </div>
            </div>

            {report.attachments.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="font-medium text-gray-400 text-sm uppercase tracking-wider">附件</h4>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {report.attachments.map((a) => (
                    <div
                      key={a.public_id}
                      className="overflow-hidden rounded-lg border border-[#202225] transition-transform hover:scale-[1.02]"
                    >
                      <AttachmentPreview attachment={a} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col items-center gap-3 border-[#202225] border-t pt-4 sm:flex-row sm:justify-between">
            <Select
              value={report.severity}
              onValueChange={(v) => onSeverityChange(report.id, v as ReportSeverity)}
            >
              <SelectTrigger className="w-full border-[#1E1F22] bg-[#202225] text-white transition-all hover:border-[#5865F2]/40 focus:ring-2 focus:ring-[#5865F2]/50 sm:w-[180px]">
                <SelectValue placeholder="設置嚴重程度" />
              </SelectTrigger>
              <SelectContent className="border-[#202225] bg-[#2F3136] text-white">
                {SEVERITY_LEVELS.map((level) => {
                  const Icon = level.icon;
                  return (
                    <SelectItem
                      key={level.value}
                      value={level.value}
                      className="cursor-pointer focus:bg-[#36393F]"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: level.color }} />
                        {level.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {report.status === "pending" && (
              <div className="flex w-full gap-3 sm:w-auto">
                <Button
                  className="flex-1 border-none bg-gradient-to-r from-[#57F287] to-green-500 font-semibold text-black shadow-sm transition-all duration-200 hover:shadow-green-500/20 hover:brightness-110 active:scale-95 sm:flex-none"
                  // 【修改此處】傳入 report 物件
                  onClick={() => onStatusChange(report, "resolved")}
                >
                  <Check className="mr-1.5 h-4 w-4" /> 接受檢舉
                </Button>
                <Button
                  className="flex-1 border-none bg-gradient-to-r from-[#ED4245] to-red-600 font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-red-500/20 hover:brightness-110 active:scale-95 sm:flex-none"
                  // 【修改此處】傳入 report 物件
                  onClick={() => onStatusChange(report, "rejected")}
                >
                  <X className="mr-1.5 h-4 w-4" /> 駁回檢舉
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

export default function ReportInbox({ reports: initial }: { reports: readonly Report[] }) {
  const {
    reports,
    filtered,
    pendingCount,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    severityFilter,
    setSeverityFilter,
    changeSeverity,
    updateLocalStatus,
  } = useReportInbox({ initial });

  const detailDialog = useDialog<Report>();

  const activeReport = useMemo(() => {
    if (!detailDialog.item) return null;
    return reports.find((r) => r.id === detailDialog.item!.id) ?? detailDialog.item;
  }, [reports, detailDialog.item]);

  const [resolveInfo, setResolveInfo] = useState<{
    report: Report;
    status: ReportStatus;
  } | null>(null);

  return (
    // [調整] 外層 Card 增加柔和的陰影效果
    <Card className="border-[#202225] bg-[#2F3136] text-white shadow-black/10 shadow-xl">
      <CardHeader className="border-[#202225]/50 border-b pb-6">
        <CardTitle className="flex items-center gap-2 font-bold text-2xl tracking-tight">
          <div className="rounded-xl bg-[#5865F2]/10 p-2">
            <Flag className="h-6 w-6 text-[#5865F2]" />
          </div>
          檢舉收件匣
          {pendingCount > 0 && (
            // [調整] 加上 pulse 動畫效果，凸顯待處理數量
            <span className="ml-2 flex animate-pulse items-center justify-center rounded-full bg-gradient-to-r from-[#ED4245] to-red-500 px-2.5 py-0.5 font-semibold text-xs shadow-red-500/20 shadow-sm">
              {pendingCount}
            </span>
          )}
        </CardTitle>
        <CardDescription className="mt-1 font-medium text-gray-400">
          審核和管理用戶檢舉，確保社群環境安全。
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="group relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-gray-400 transition-colors group-focus-within:text-[#5865F2]" />
              <Input
                placeholder="搜尋檢舉..."
                // [調整] Input 互動回饋：增加 transition、hover 狀態以及 focus 時的光環
                className="rounded-lg border-[#1E1F22] bg-[#202225] pl-10 text-white transition-all duration-200 placeholder:text-gray-500 hover:border-[#5865F2]/40 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[#5865F2]/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ReportStatus | "all")}
            >
              <SelectTrigger className="w-full rounded-lg border-[#1E1F22] bg-[#202225] text-white transition-all hover:border-[#5865F2]/40 focus:ring-2 focus:ring-[#5865F2]/50 sm:w-[150px]">
                <SelectValue placeholder="狀態" />
              </SelectTrigger>
              <SelectContent className="border-[#202225] bg-[#2F3136] text-white">
                <SelectItem value="all" className="cursor-pointer focus:bg-[#36393F]">
                  全部狀態
                </SelectItem>
                <SelectItem value="pending" className="cursor-pointer focus:bg-[#36393F]">
                  待處理
                </SelectItem>
                <SelectItem value="resolved" className="cursor-pointer focus:bg-[#36393F]">
                  已採取動作
                </SelectItem>
                <SelectItem value="rejected" className="cursor-pointer focus:bg-[#36393F]">
                  已駁回
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v as ReportSeverity | "all")}
            >
              <SelectTrigger className="w-full rounded-lg border-[#1E1F22] bg-[#202225] text-white transition-all hover:border-[#5865F2]/40 focus:ring-2 focus:ring-[#5865F2]/50 sm:w-[150px]">
                <SelectValue placeholder="嚴重程度" />
              </SelectTrigger>
              <SelectContent className="border-[#202225] bg-[#2F3136] text-white">
                <SelectItem value="all" className="cursor-pointer focus:bg-[#36393F]">
                  全部程度
                </SelectItem>
                {SEVERITY_LEVELS.map((l) => (
                  <SelectItem
                    key={l.value}
                    value={l.value}
                    className="cursor-pointer focus:bg-[#36393F]"
                  >
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Report list */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-[#202225] border-dashed bg-[#36393F]/50 py-16 text-center text-gray-500">
                <div className="mb-4 rounded-full bg-[#202225] p-4">
                  <Flag className="h-8 w-8 text-white opacity-40" />
                </div>
                <p className="font-medium">
                  {search ? "沒有符合搜尋條件的檢舉" : "目前沒有任何檢舉"}
                </p>
              </div>
            ) : (
              filtered.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onView={detailDialog.open}
                  onResolve={(r) => setResolveInfo({ report: r, status: "resolved" })}
                  onReject={(r) => setResolveInfo({ report: r, status: "rejected" })}
                />
              ))
            )}
          </div>
        </div>
      </CardContent>

      {activeReport && (
        <ReportDetailDialog
          report={activeReport}
          isOpen={detailDialog.isOpen}
          onClose={detailDialog.close}
          onStatusChange={(r, status) => setResolveInfo({ report: r, status })}
          onSeverityChange={changeSeverity}
        />
      )}

      {resolveInfo && (
        <ResolveDialog
          open={!!resolveInfo}
          onOpenChange={(isOpen) => {
            if (!isOpen) setResolveInfo(null);
          }}
          report={resolveInfo.report}
          status={resolveInfo.status}
          onSuccessUpdate={(id, status) => {
            updateLocalStatus(id, status);
          }}
        />
      )}
    </Card>
  );
}
