"use client";

import {
	ExternalLink,
	FileText,
	Image as ImageIcon,
	type LucideIcon,
	Video,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { UploadedFile } from "#/lib/types";
import type { ReportAttachment } from "#/types/admin";

interface AttachmentPreviewProps {
	attachment: UploadedFile | ReportAttachment;
}

const useRawAttachment = (
	url: string,
	type: UploadedFile["type"] | ReportAttachment["type"],
) => {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);

	useEffect(() => {
		if (type !== "raw" || !url) return;

		const controller = new AbortController();
		setIsLoading(true);
		setError(null);

		const fetchRawData = async () => {
			try {
				const res = await fetchJsonEffect(url, { signal: controller.signal });
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

		return () => controller.abort();
	}, [url, type]);

	return { content, error, isLoading };
};

const AttachmentPreview = memo(({ attachment }: AttachmentPreviewProps) => {
	const type = attachment.type;
	const url = attachment.url;

	const [imgError, setImgError] = useState(false);

	const fileName =
		("original_filename" in attachment && attachment.original_filename) ||
		("filename" in attachment && (attachment as any).filename) ||
		("name" in attachment && (attachment as any).name) ||
		"未命名檔案";

	const isImage = type === "image";
	const isVideo = type === "video";
	const isRaw = type === "raw";

	const { content, error, isLoading } = useRawAttachment(url, type);
	const Icon: LucideIcon = isImage ? ImageIcon : isVideo ? Video : FileText;

	// 將外層容器改為 semantic 標籤或 <a> 標籤
	const Container = url ? "a" : "div";

	return (
		<Container
			href={url || undefined}
			target={url ? "_blank" : undefined}
			rel={url ? "noopener noreferrer" : undefined}
			className="block space-y-2 rounded-md bg-[#2F3136] p-3 text-white transition-all hover:bg-[#34373c] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			style={{ textDecoration: "none" }}
		>
			{/* 標題與 Icon 區塊 */}
			<div className="flex items-center justify-between text-sm">
				<div className="flex items-center gap-2 min-w-0">
					<Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
					<span className="line-clamp-1 break-words" title={fileName}>
						{fileName}
					</span>
				</div>
				{url && (
					<ExternalLink className="h-4 w-4 text-gray-400 opacity-60 shrink-0" />
				)}
			</div>

			{/* 圖片預覽 */}
			{isImage && (
				<div className="w-full overflow-hidden rounded-md border border-[#202225] bg-[#202225]">
					{!url || imgError ? (
						<div className="flex h-[150px] w-full flex-col items-center justify-center gap-2 text-gray-400 text-xs">
							<ImageIcon className="h-8 w-8 text-gray-500" />
							<span>無法載入圖片或無效的連結</span>
						</div>
					) : (
						<img
							src={url}
							alt={`預覽圖：${fileName}`}
							loading="lazy"
							decoding="async"
							className="h-auto max-h-[300px] w-full object-contain transition-transform duration-200"
							onError={() => setImgError(true)}
						/>
					)}
				</div>
			)}

			{/* 影片預覽 */}
			{isVideo && url && (
				<div
					className="w-full overflow-hidden rounded-md border border-[#202225]"
					role="document"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					{/** biome-ignore lint/a11y/useMediaCaption: yeah */}
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
		</Container>
	);
});

AttachmentPreview.displayName = "AttachmentPreview";

export default AttachmentPreview;
