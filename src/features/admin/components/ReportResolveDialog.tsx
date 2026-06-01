"use client";

import { memo, useCallback, useState, useTransition } from "react";
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
import type { Report } from "@/types/admin";
import { resolveReportServerFn, sendNotification } from "../admin.functions";

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
	const [isPending, startTransition] = useTransition();

	const submitResolution = useCallback(
		(note: string) => {
			startTransition(async () => {
				try {
					const isResolved = status === "resolved";

					const notificationContent = `我們審查了您於 ${report.reportedAt} 提出的檢舉。\n\n檢舉標題為：${report.subject}\n檢舉內容為：${report.content}\n\n審查結果：${getReviewResultMessage(isResolved)}`;

					await resolveReportServerFn({
						data: {
							reportId: report.id,
							status,
							resolutionNote: note,
						},
					});

					await sendNotification({
						subject: "您的檢舉已處理完畢",
						teaser: "我們審查了您的檢舉...",
						content: notificationContent,
						priority: isResolved ? "success" : "warning",
						userIds: [report.reportedBy.id],
					});

					onSuccess();
				} catch (error) {
					toast.error("處理檢舉時發生錯誤，請稍後再試");
					console.error("Failed to resolve report:", error);
				}
			});
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
};

// --- UI 組件 ---
export const ResolveDialog = memo(function ResolveDialog({
	open,
	onOpenChange,
	report,
	status,
}: Props) {
	const [note, setNote] = useState("");
	const isResolved = status === "resolved";

	const handleSuccess = useCallback(() => {
		setNote("");
		onOpenChange(false);
	}, [onOpenChange]);

	const { submitResolution, isPending } = useResolveAction(
		report,
		status,
		handleSuccess,
	);

	const handleSubmit = useCallback(() => {
		if (note.trim()) {
			submitResolution(note);
		}
	}, [note, submitResolution]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* 【樣式調整】DialogContent
              - 增加 `rounded-2xl` 與 `shadow-2xl` 提升現代感浮雕視覺。
              - `p-6 sm:p-8` 讓手機與桌機有適當的呼吸空間。
              - 遵循要求，不加入任何 bg- 類別以保留原始背景色。
            */}
			<DialogContent className="sm:max-w-md rounded-2xl shadow-2xl p-6 sm:p-8 border-muted/40 gap-6">
				{/* 【樣式調整】DialogHeader
                  - 強制文字靠左 `text-left`，避免手機版預設置中造成的排版跳動。
                  - Title 加入 `tracking-tight` 提升標題俐落感。
                */}
				<DialogHeader className="space-y-2 text-left">
					<DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
						{isResolved ? "接受檢舉" : "駁回檢舉"}
						<span className="text-muted-foreground text-sm sm:text-base font-normal">
							/ 處理說明
						</span>
					</DialogTitle>
					<DialogDescription className="text-sm sm:text-base leading-relaxed text-muted-foreground/80">
						請說明您為什麼{isResolved ? "接受" : "駁回"}此舉報。
					</DialogDescription>
				</DialogHeader>

				{/* 【樣式調整】Textarea
                  - `transition-all duration-300` 讓 hover 和 focus 時有滑順的過渡。
                  - `hover:border-primary/50` 增加互動提示。
                  - `focus-visible:ring-2 focus-visible:ring-primary/40` 增強無障礙與視覺焦點。
                  - `rounded-xl` 呼應外部彈窗的圓角設定。
                */}
				<Textarea
					placeholder="請填寫處理的說明..."
					rows={5}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					disabled={isPending}
					className="resize-none rounded-xl p-4 text-base transition-all duration-300 ease-in-out border-muted hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary shadow-sm bg-transparent disabled:opacity-50"
				/>

				{/* 【樣式調整】DialogFooter
                  - `flex-col sm:flex-row gap-3`：在手機版時按鈕上下排列並填滿寬度，平板/桌機時並排。
                */}
				<DialogFooter className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-2">
					{/* 【樣式調整】取消按鈕
                      - `rounded-full` 膠囊按鈕設計。
                      - `active:scale-95` 點擊時的微縮回饋感。
                    */}
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
						className="w-full sm:w-auto rounded-full transition-all duration-200 hover:bg-muted active:scale-95 focus-visible:ring-2"
					>
						取消
					</Button>

					{/* 【樣式調整】送出按鈕
                      - 加入 `bg-gradient-to-r` 漸層效果，這裡使用 theme 的 primary 變數來維持 Shadcn 的動態主題兼容性。
                      - `shadow-md hover:shadow-lg` 增加立體層次。
                      - `active:scale-95` 物理按壓感。
                    */}
					<Button
						disabled={isPending || !note.trim()}
						onClick={handleSubmit}
						className="w-full sm:w-auto rounded-full bg-gradient-to-r from-primary to-primary/70 hover:to-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-300 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none"
					>
						{isPending ? "送出中..." : "確認送出"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});
