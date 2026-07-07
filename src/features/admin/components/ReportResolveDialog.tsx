"use client";

import { memo, useCallback, useState } from "react"; // [修改] 移除 useTransition
import { toast } from "react-toastify";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Textarea } from "#/components/ui/textarea";
import type { Report, ReportStatus } from "@/types/admin";
import { resolveReportServerFn, SendNotificationFn } from "../admin.functions";

// --- 獨立的純函式 ---
function getReviewResultMessage(isResolved: boolean): string {
  return isResolved
    ? `我們已確認你的檢舉內容是違反規定的，並已對相關項目採取了處理措施。感謝您幫助我們維護DiscordHubs的品質！`
    : `很遺憾，我們仔細審查了你的檢舉，但內容目前尚未達到處理標準，故未採取進一步行動。如有疑慮或有新證據，歡迎再次回報！`;
}

// --- Custom Hook：處理業務邏輯 (SRP) ---
function useResolveAction(
  report: Report,
  status: "resolved" | "rejected" | "pending",
  onSuccess: () => void,
) {
  // [修改] 使用 useState 來明確控制表單送出的載入狀態
  const [isPending, setIsPending] = useState(false);

  const submitResolution = useCallback(
    async (note: string) => {
      setIsPending(true);
      try {
        const isResolved = status === "resolved";
        const notificationContent = `我們審查了您於 ${report.reportedAt} 提出的檢舉。\n\n檢舉標題為：${report.subject}\n檢舉內容為：${report.content}\n\n審查結果：${getReviewResultMessage(isResolved)}`;

        const result = await resolveReportServerFn({
          data: {
            reportId: report.id,
            status,
            resolutionNote: note,
          },
        });

        // [重要修改] 如果您的 Server Action 失敗是回傳 `{ success: false }`，需要手動攔截並中斷
        if (result && result.success === false) {
          toast.error(result.error ?? "處理檢舉失敗");
          return;
        }

        await SendNotificationFn({
          data: {
            subject: "您的檢舉已處理完畢",
            content: notificationContent,
            priority: isResolved ? "success" : "error",
            userIds: [report.reportedBy.id],
          },
        });

        onSuccess();
      } catch (error) {
        toast.error("處理檢舉時發生錯誤，請稍後再試");
        console.error("Failed to resolve report:", error);
      } finally {
        setIsPending(false); // [修改] 結束載入狀態
      }
    },
    [report, status, onSuccess],
  );

  return { submitResolution, isPending };
}

// --- UI 組件型別 ---
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: Report;
  status: "resolved" | "rejected" | "pending";
  onSuccessUpdate?: (reportId: string, newStatus: ReportStatus) => void;
};

// --- UI 組件 ---
export const ResolveDialog = memo(function ResolveDialog({
  open,
  onOpenChange,
  report,
  status,
  onSuccessUpdate,
}: Props) {
  const [note, setNote] = useState("");
  const isResolved = status === "resolved";

  const handleSuccess = useCallback(() => {
    setNote("");
    onOpenChange(false);
    if (onSuccessUpdate) {
      onSuccessUpdate(report.id, status);
    }
  }, [onOpenChange, onSuccessUpdate, report.id, status]);

  const { submitResolution, isPending } = useResolveAction(report, status, handleSuccess);

  const handleSubmit = useCallback(() => {
    if (note.trim()) {
      submitResolution(note);
    }
  }, [note, submitResolution]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6 rounded-2xl border-muted/40 p-6 shadow-2xl sm:max-w-md sm:p-8">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="flex items-center gap-2 font-bold text-xl tracking-tight sm:text-2xl">
            {isResolved ? "接受檢舉" : "駁回檢舉"}
            <span className="font-normal text-muted-foreground text-sm sm:text-base">
              / 處理說明
            </span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/80 text-sm leading-relaxed sm:text-base">
            請說明您為什麼{isResolved ? "接受" : "駁回"}此舉報。
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="請填寫處理的說明..."
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
          className="resize-none rounded-xl border-muted bg-transparent p-4 text-base shadow-sm transition-all duration-300 ease-in-out hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
        />

        <DialogFooter className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="w-full rounded-full transition-all duration-200 hover:bg-muted focus-visible:ring-2 active:scale-95 sm:w-auto"
          >
            取消
          </Button>

          <Button
            disabled={isPending || !note.trim()}
            onClick={handleSubmit}
            className="w-full rounded-full bg-gradient-to-r from-primary to-primary/70 text-primary-foreground shadow-md transition-all duration-300 hover:to-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 disabled:opacity-50 disabled:shadow-none sm:w-auto"
          >
            {isPending ? "送出中..." : "確認送出"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
