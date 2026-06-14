// ============================================================
// components/reject-bot-dialog.tsx
// ============================================================

import { AlertCircle, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Developer } from "@/types/admin";
import { Button } from "../../../components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { rejectBotServerFn } from "../admin.functions";

const MIN_CHARS = 4;
const MAX_CHARS = 500;

const QUICK_REASONS = [
	"機器人功能與描述不符",
	"包含不適當或違規內容",
	"邀請連結無效",
] as const;

export default memo(function RejectBotDialog({
	botId,
	botName,
	userIds,
	isOpen,
	onClose,
	onConfirm,
}: {
	botId: string;
	botName: string;
	userIds: readonly Developer[];
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Reset state when dialog closes
	useEffect(() => {
		if (!isOpen) {
			const t = setTimeout(() => {
				setReason("");
				setIsSubmitting(false);
			}, 300);
			return () => clearTimeout(t);
		}
	}, [isOpen]);

	const charCount = reason.trim().length;
	const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;
	const isOverLimit = charCount > MAX_CHARS;

	const charCountColor = useMemo(() => {
		if (isOverLimit) return "text-red-500 font-semibold"; // 強化超出的視覺警示
		if (charCount < MIN_CHARS) return "text-gray-400";
		return "text-green-500 font-medium"; // 達標時給予正向反饋的加粗
	}, [charCount, isOverLimit]);

	const handleQuickSelect = useCallback((selected: string) => {
		setReason((prev) =>
			prev.includes(selected) ? prev : prev ? `${prev}；${selected}` : selected,
		);
	}, []);

	const handleClose = useCallback(() => {
		if (!isSubmitting) onClose();
	}, [isSubmitting, onClose]);

	const handleConfirm = useCallback(async () => {
		if (!isValid || isSubmitting) return;
		setIsSubmitting(true);
		try {
			await rejectBotServerFn({
				data: {
					botId,
					reason: reason.trim(),
					userIds: userIds.map((u) => u.id),
				},
			});

			onConfirm(reason.trim());
		} catch (e) {
			console.error("Failed to reject bot:", e);
			setIsSubmitting(false);
		}
	}, [botId, userIds, reason, isValid, isSubmitting, onConfirm]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && isValid) {
				e.preventDefault();
				void handleConfirm();
			}
		},
		[isValid, handleConfirm],
	);

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			{/* 調整 DialogContent：保留原有的深色背景與邊框 */}
			<DialogContent
				className="max-h-[90vh] overflow-y-auto rounded-xl border border-[#202225] bg-[#36393F] shadow-2xl sm:max-w-[550px] sm:rounded-2xl"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="mb-2">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
						{/* 圖示包裝：改為適合深色模式的暗紅色半透明背景與邊框 */}
						<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 shadow-sm">
							<AlertCircle className="h-6 w-6 text-red-400" />
						</div>
						<div className="space-y-1">
							<DialogTitle className="font-bold text-gray-50 text-xl tracking-tight sm:text-2xl">
								拒絕機器人申請
							</DialogTitle>
							{/* 描述文字改為淺灰色，機器人名稱加上更深的背景突顯 */}
							<DialogDescription className="text-gray-400 text-sm leading-relaxed">
								您即將拒絕{" "}
								<span className="rounded-md bg-[#202225] px-1.5 py-0.5 font-semibold text-gray-200">
									{botName}
								</span>{" "}
								的申請，請詳細說明拒絕原因以幫助開發者改進。
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-5 py-2">
					<div className="space-y-3">
						<Label className="font-medium text-gray-300 text-sm">
							快速帶入原因（點擊添加）
						</Label>
						<div className="flex flex-wrap gap-2">
							{QUICK_REASONS.map((r) => (
								<Button
									key={r}
									type="button"
									variant="outline"
									size="sm"
									// 快速按鈕：改用深色邊框、透明背景，hover 時呈現稍亮的深灰色
									className="h-auto rounded-full border-gray-600 bg-transparent px-3.5 py-1.5 text-gray-300 text-xs transition-all duration-200 ease-in-out hover:border-gray-500 hover:bg-[#4F545C] hover:text-white hover:shadow-sm focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#36393F] active:scale-95"
									onClick={() => handleQuickSelect(r)}
									disabled={isSubmitting}
								>
									{r}
								</Button>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label
								htmlFor="reason"
								className="font-medium text-gray-300 text-sm"
							>
								拒絕原因 <span className="text-red-400">*</span>
							</Label>
							<span
								className={`text-xs ${charCountColor} transition-colors duration-300`}
							>
								{charCount} / {MAX_CHARS}
								{charCount < MIN_CHARS && (
									<span className="ml-1 opacity-75">(至少 {MIN_CHARS} 字)</span>
								)}
							</span>
						</div>
						{/* Textarea：深色背景 (#202225 產生凹陷感)，淺色文字，調整 focus 的發光顏色 */}
						<Textarea
							id="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="請詳細說明拒絕原因，例如：「機器人功能與審核文件描述有落差...」"
							className={`min-h-[160px] resize-none border-gray-600 bg-[#202225] text-gray-200 text-sm shadow-sm transition-all duration-300 placeholder:text-gray-500 focus-visible:shadow-md focus-visible:ring-offset-0 ${
								isOverLimit
									? "border-red-400/80 focus-visible:border-red-400 focus-visible:ring-red-500/30"
									: "focus-visible:border-blue-400 focus-visible:ring-blue-500/30"
							}`}
							disabled={isSubmitting}
							maxLength={MAX_CHARS + 50}
						/>

						<div className="flex h-4 items-center">
							{charCount > 0 && charCount < MIN_CHARS && (
								<p className="fade-in slide-in-from-top-1 flex animate-in items-center gap-1.5 font-medium text-amber-400 text-xs">
									<AlertCircle className="h-3.5 w-3.5" /> 還需要至少{" "}
									{MIN_CHARS - charCount} 個字
								</p>
							)}
							{charCount > MAX_CHARS && (
								<p className="fade-in slide-in-from-top-1 flex animate-in items-center gap-1.5 font-medium text-red-400 text-xs">
									<AlertCircle className="h-3.5 w-3.5" /> 超出{" "}
									{charCount - MAX_CHARS} 個字
								</p>
							)}
						</div>
					</div>

					{/* 提示區塊：改成適合深色模式的半透明藍色背景 */}
					<div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 shadow-sm backdrop-blur-sm">
						<p className="flex items-center gap-2 text-blue-200 text-xs">
							<span className="text-base leading-none">💡</span>
							<span>
								<span className="font-semibold text-blue-300">小提示：</span>
								您可以使用 {/* 鍵盤按鍵樣式調整為深藍色透底 */}
								<kbd className="pointer-events-none mx-1 inline-flex h-5 items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-1.5 font-medium font-mono text-[10px] text-blue-200 opacity-100">
									Ctrl/Cmd + Enter
								</kbd>{" "}
								快速提交審核。
							</span>
						</p>
					</div>
				</div>

				<DialogFooter className="mt-2 gap-3 sm:gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={isSubmitting}
						// 取消按鈕：深色邊框，hover 時底色變亮 (深灰)
						className="flex-1 border-gray-600 bg-transparent text-gray-300 transition-all duration-200 hover:bg-[#4F545C] hover:text-white focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#36393F] active:scale-95 sm:flex-initial"
					>
						<X className="mr-1.5 h-4 w-4" /> 取消
					</Button>
					<Button
						type="button"
						onClick={() => void handleConfirm()}
						disabled={!isValid || isSubmitting}
						// 確認按鈕：保留紅色漸層，但稍微加深以配合整體暗色調
						className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-sm transition-all duration-200 hover:from-red-500 hover:to-red-600 hover:shadow-md focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#36393F] active:scale-95 disabled:pointer-events-none disabled:opacity-50 sm:flex-initial"
					>
						{isSubmitting ? (
							<>
								<span className="mr-2 inline-block animate-spin text-base">
									⏳
								</span>
								處理中...
							</>
						) : (
							<>
								<AlertCircle className="mr-1.5 h-4 w-4" />
								確認拒絕
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});
