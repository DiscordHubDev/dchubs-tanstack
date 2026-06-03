// ============================================================
// components/reject-bot-dialog.tsx
// ============================================================

import { AlertCircle, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJsonEffect, runEffect } from "#/lib/effect-utils";
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
			await runEffect(
				fetchJsonEffect("/api/reject-bot", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						userIds: userIds.map((d) => d.id),
						botName,
						reason: reason.trim(),
					}),
				}),
			);

			onConfirm(reason.trim());
		} catch (e) {
			console.error("Failed to reject bot:", e);
			setIsSubmitting(false);
		}
	}, [botName, userIds, reason, isValid, isSubmitting, onConfirm]);

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
			{/* 調整 DialogContent：增加陰影層次、更圓滑的邊角、進場/退場動畫的配合（視 Shadcn 設定而定） */}
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[550px] sm:rounded-2xl shadow-2xl border-gray-100"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="mb-2">
					<div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
						{/* 將 Icon 包裝，加入柔和的紅色背景與漸層/陰影，提升現代感 */}
						<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-50 to-red-100 shadow-sm border border-red-100/50">
							<AlertCircle className="h-6 w-6 text-red-600" />
						</div>
						<div className="space-y-1">
							<DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
								拒絕機器人申請
							</DialogTitle>
							<DialogDescription className="text-gray-500 text-sm leading-relaxed">
								您即將拒絕{" "}
								<span className="font-semibold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded-md">
									{botName}
								</span>{" "}
								的申請，請詳細說明拒絕原因以幫助開發者改進。
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-5 py-2">
					<div className="space-y-3">
						<Label className="font-medium text-sm text-gray-700">
							快速帶入原因（點擊添加）
						</Label>
						<div className="flex flex-wrap gap-2">
							{QUICK_REASONS.map((r) => (
								<Button
									key={r}
									type="button"
									variant="outline"
									size="sm"
									// 按鈕優化：增加圓角、過渡動畫、hover 漸層與位移、focus 狀態、點擊縮放 (active:scale-95)
									className="h-auto py-1.5 px-3.5 text-xs rounded-full border-gray-200 text-gray-600 transition-all duration-200 ease-in-out hover:border-gray-300 hover:bg-gradient-to-b hover:from-gray-50 hover:to-gray-100 hover:text-gray-900 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 active:scale-95"
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
								className="font-medium text-sm text-gray-700"
							>
								拒絕原因 <span className="text-red-500">*</span>
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
						{/* Textarea 優化：增加柔和陰影、聚焦時的邊框發光與顏色變換 */}
						<Textarea
							id="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="請詳細說明拒絕原因，例如：「機器人功能與審核文件描述有落差...」"
							className={`min-h-[160px] resize-none text-sm transition-all duration-300 shadow-sm focus-visible:shadow-md ${
								isOverLimit
									? "border-red-400 focus-visible:ring-red-500/30 focus-visible:border-red-500"
									: "focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
							}`}
							disabled={isSubmitting}
							maxLength={MAX_CHARS + 50}
						/>

						{/* 狀態提示文字加入輕微的滑動出現感與對比度 */}
						<div className="h-4 flex items-center">
							{charCount > 0 && charCount < MIN_CHARS && (
								<p className="flex items-center gap-1.5 text-amber-600 text-xs font-medium animate-in fade-in slide-in-from-top-1">
									<AlertCircle className="h-3.5 w-3.5" /> 還需要至少{" "}
									{MIN_CHARS - charCount} 個字
								</p>
							)}
							{isOverLimit && (
								<p className="flex items-center gap-1.5 text-red-500 text-xs font-medium animate-in fade-in slide-in-from-top-1">
									<AlertCircle className="h-3.5 w-3.5" /> 超出{" "}
									{charCount - MAX_CHARS} 個字
								</p>
							)}
						</div>
					</div>

					{/* 提示區塊優化：使用漸層背景取代單色，增加透明度與毛玻璃效果 (backdrop-blur) */}
					<div className="rounded-xl border border-blue-100/60 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-3.5 shadow-sm backdrop-blur-sm">
						<p className="text-blue-800/90 text-xs flex items-center gap-2">
							<span className="text-base leading-none">💡</span>
							<span>
								<span className="font-semibold text-blue-900">小提示：</span>
								您可以使用{" "}
								<kbd className="pointer-events-none mx-1 inline-flex h-5 items-center gap-1 rounded border border-blue-200 bg-blue-100/50 px-1.5 font-mono text-[10px] font-medium text-blue-900 opacity-100">
									Ctrl/Cmd + Enter
								</kbd>{" "}
								快速提交審核。
							</span>
						</p>
					</div>
				</div>

				{/* Footer 按鈕佈局優化：加強按鈕層級的對比 (Primary vs Secondary) */}
				<DialogFooter className="gap-3 sm:gap-2 mt-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={isSubmitting}
						// 取消按鈕：增強 hover 背景、focus 狀態與點擊縮放
						className="flex-1 sm:flex-initial transition-all duration-200 hover:bg-gray-100 hover:text-gray-900 active:scale-95 focus-visible:ring-2 focus-visible:ring-gray-300"
					>
						<X className="mr-1.5 h-4 w-4" /> 取消
					</Button>
					<Button
						type="button"
						onClick={() => void handleConfirm()}
						disabled={!isValid || isSubmitting}
						// 確認按鈕：改用紅色漸層增加重量感，加入 hover 陰影/漸層變化與 active 縮放
						className="flex-1 sm:flex-initial bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm transition-all duration-200 hover:from-red-600 hover:to-red-700 hover:shadow-md active:scale-95 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
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
