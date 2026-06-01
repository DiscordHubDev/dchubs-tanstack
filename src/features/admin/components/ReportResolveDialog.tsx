"use client";

import { memo, useCallback, useState, useTransition } from "react";
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
import { resolveReport, sendNotification } from "../admin.functions";

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
	// React 19 支援在 useTransition 傳入非同步函式，自動管理 isPending
	const [isPending, startTransition] = useTransition();

	const submitResolution = useCallback(
		(note: string) => {
			startTransition(async () => {
				try {
					const isResolved = status === "resolved";

					// 【效能優化】將字串拼接移入執行階段，避免 Render 時重複計算
					const notificationContent = `我們審查了您於 ${report.reportedAt} 提出的檢舉。\n\n檢舉標題為：${report.subject}\n檢舉內容為：${report.content}\n\n審查結果：${getReviewResultMessage(isResolved)}`;

					await resolveReport({
						reportId: report.id,
						status,
						resolutionNote: note,
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
					// 實務上這裡應加入 Error Toast 處理
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
		setNote(""); // 送出成功後清空狀態
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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isResolved ? "接受檢舉" : "駁回檢舉"} - 處理說明
					</DialogTitle>
					<DialogDescription>
						請說明您為什麼{isResolved ? "接受" : "駁回"}此舉報。
					</DialogDescription>
				</DialogHeader>

				<Textarea
					placeholder="請填寫處理的說明..."
					rows={5}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					disabled={isPending}
				/>

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						取消
					</Button>
					<Button disabled={isPending || !note.trim()} onClick={handleSubmit}>
						{isPending ? "送出中..." : "確認送出"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});
