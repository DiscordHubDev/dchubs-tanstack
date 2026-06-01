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
	onConfirm: (id: string, reason: string) => void;
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
		if (isOverLimit) return "text-red-500";
		if (charCount < MIN_CHARS) return "text-gray-400";
		return "text-green-500";
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
			const res = await fetch("/api/reject-bot", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userIds: userIds.map((d) => d.id),
					botName,
					reason: reason.trim(),
				}),
			});
			if (!res.ok) throw new Error("Failed to send rejection DMs");
			onConfirm(botId, reason.trim());
		} catch (e) {
			console.error("Failed to reject bot:", e);
			setIsSubmitting(false);
		}
	}, [botId, botName, userIds, reason, isValid, isSubmitting, onConfirm]);

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
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[550px]"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader>
					<div className="flex items-center gap-2">
						<AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
						<DialogTitle className="text-lg sm:text-xl">
							拒絕機器人申請
						</DialogTitle>
					</div>
					<DialogDescription className="mt-2 text-gray-500 text-sm">
						您即將拒絕{" "}
						<span className="font-semibold text-gray-700">{botName}</span>{" "}
						的申請，請說明拒絕原因以幫助開發者改進。
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label className="font-medium text-sm">
							常見原因（點擊快速添加）
						</Label>
						<div className="flex flex-wrap gap-2">
							{QUICK_REASONS.map((r) => (
								<Button
									key={r}
									type="button"
									variant="outline"
									size="sm"
									className="h-auto py-1.5 text-xs hover:bg-gray-100"
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
							<Label htmlFor="reason" className="font-medium text-sm">
								拒絕原因 <span className="text-red-500">*</span>
							</Label>
							<span className={`text-xs ${charCountColor} transition-colors`}>
								{charCount} / {MAX_CHARS}
								{charCount < MIN_CHARS && (
									<span className="ml-1">(至少 {MIN_CHARS} 字)</span>
								)}
							</span>
						</div>
						<Textarea
							id="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="請詳細說明拒絕原因..."
							className={`min-h-[150px] resize-none transition-colors ${isOverLimit ? "border-red-500 focus-visible:ring-red-500" : ""}`}
							disabled={isSubmitting}
							maxLength={MAX_CHARS + 50}
						/>
						{charCount > 0 && charCount < MIN_CHARS && (
							<p className="flex items-center gap-1 text-amber-600 text-xs">
								<AlertCircle className="h-3 w-3" /> 還需要至少{" "}
								{MIN_CHARS - charCount} 個字
							</p>
						)}
						{isOverLimit && (
							<p className="flex items-center gap-1 text-red-500 text-xs">
								<AlertCircle className="h-3 w-3" /> 超出 {charCount - MAX_CHARS}{" "}
								個字
							</p>
						)}
					</div>

					<div className="rounded-md border border-blue-200 bg-blue-50 p-3">
						<p className="text-blue-800 text-xs">
							💡 <span className="font-medium">提示：</span>您也可以使用
							Ctrl/Cmd + Enter 快速提交。
						</p>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={isSubmitting}
						className="flex-1 sm:flex-initial"
					>
						<X className="mr-1 h-4 w-4" /> 取消
					</Button>
					<Button
						type="button"
						onClick={() => void handleConfirm()}
						disabled={!isValid || isSubmitting}
						className="flex-1 bg-red-600 text-white hover:bg-red-700 sm:flex-initial"
					>
						{isSubmitting ? (
							<>
								<span className="mr-2 inline-block animate-spin">⏳</span>
								處理中...
							</>
						) : (
							<>
								<AlertCircle className="mr-1 h-4 w-4" />
								確認拒絕
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});
