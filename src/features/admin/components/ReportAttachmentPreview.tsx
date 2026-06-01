"use client";

import {
	FileText,
	Image as ImageIcon,
	type LucideIcon,
	Video,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { UploadedFile } from "#/lib/types";
import type { ReportAttachment } from "#/types/admin";

// ==========================================
// 1. 型別定義 (Type Definitions)
// ==========================================
interface AttachmentPreviewProps {
	attachment: UploadedFile | ReportAttachment;
}

// ==========================================
// 2. Custom Hook: 專責處理 Raw 檔案獲取邏輯
// ==========================================
const useRawAttachment = (
	url: string,
	type: UploadedFile["type"] | ReportAttachment["type"],
) => {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);

	useEffect(() => {
		// 只有在 type 為 'raw' 且有 url 時才執行
		if (type !== "raw" || !url) return;

		// 使用 AbortController 避免 Race Condition 與 Memory Leak
		const controller = new AbortController();
		setIsLoading(true);
		setError(null);

		const fetchRawData = async () => {
			try {
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok) throw new Error("伺服器回應錯誤");
				const text = await res.text();
				setContent(text);
			} catch (err: unknown) {
				if (err instanceof Error && err.name !== "AbortError") {
					setError("無法讀取內容，請稍後再試");
				}
			} finally {
				setIsLoading(false);
			}
		};

		fetchRawData();

		// Cleanup: 組件卸載或 url 改變時，取消未完成的請求
		return () => controller.abort();
	}, [url, type]);

	return { content, error, isLoading };
};

// ==========================================
// 3. UI 呈現組件 (使用 memo 防止不必要的 Rerender)
// ==========================================
const AttachmentPreview = memo(({ attachment }: AttachmentPreviewProps) => {
	const type = attachment.type;
	const url = attachment.url;

	// 如果 attachment 裡有 original_filename 就用，沒有就試著找 filename/name，或者給個預設值
	const fileName =
		"original_filename" in attachment
			? attachment.original_filename
			: "name" in attachment
				? (attachment as any).name
				: "未命名檔案";

	const isImage = type === "image";
	const isVideo = type === "video";
	const isRaw = type === "raw";

	const { content, error, isLoading } = useRawAttachment(url, type);
	const Icon: LucideIcon = isImage ? ImageIcon : isVideo ? Video : FileText;

	return (
		<div className="space-y-2 rounded-md bg-[#2F3136] p-3">
			{/* 標題與 Icon 區塊 */}
			<div className="flex items-center gap-2 text-sm">
				<Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
				<span className="line-clamp-1 break-words" title={fileName}>
					{fileName}
				</span>
			</div>

			{/* 圖片預覽 */}
			{isImage && (
				<div className="w-full overflow-hidden rounded-md border border-[#202225]">
					<img
						src={url || "/placeholder.png"}
						alt={`預覽圖：${fileName}`}
						loading="lazy" // 效能優化：原生延遲載入
						decoding="async"
						className="h-auto max-h-[300px] w-full object-contain"
					/>
				</div>
			)}

			{/* 影片預覽 */}
			{isVideo && (
				<div className="w-full overflow-hidden rounded-md border border-[#202225]">
					{/* biome-ignore lint/a11y/useMediaCaption: 這是使用者任意上傳的影片預覽，系統無法提供或強制要求字幕檔 */}
					<video
						controls
						preload="metadata"
						src={url}
						className="max-h-75 w-full bg-black object-contain"
					/>
				</div>
			)}

			{/* 純文字預覽 */}
			{isRaw && (
				<div className="max-h-75 overflow-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-[#202225] p-2 font-mono text-sm">
					{error ? (
						<span className="text-red-500">{error}</span>
					) : isLoading ? (
						<span className="animate-pulse text-gray-400">載入中...</span>
					) : (
						<span>{content ?? "檔案為空"}</span>
					)}
				</div>
			)}
		</div>
	);
});

// 為了在 DevTools 中有更好的顯示名稱
AttachmentPreview.displayName = "AttachmentPreview";

export default AttachmentPreview;
