import { Image } from "@unpic/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { getProxyImageUrl } from "#/utils/image";

interface OptimizedImageProps
	extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "placeholder"> {
	src?: string | null;
	alt: string;
	width?: number;
	height?: number;
	className?: string;
	fallbackSrc?: string;
	fallbackNode?: ReactNode;
	layout?: "constrained" | "fixed";
}

// 輔助函式：將 width 轉換為符合 Discord 規範的尺寸（1024 的倍數，最低 1024）
function calculateDiscordSize(targetWidth: number): number {
	const base = 1024;
	// 使用 Math.ceil 向上取整，確保解析度足夠；若寬度小於 1024 則保底 1024
	if (targetWidth <= base) return base;
	return Math.ceil(targetWidth / base) * base;
}

export function OptimizedImage({
	src,
	alt,
	width = 600,
	height = 400,
	className = "",
	fallbackSrc,
	fallbackNode,
	layout = "constrained",
	...props
}: OptimizedImageProps) {
	const actualSrc = src || fallbackSrc;

	if (!actualSrc) {
		if (fallbackNode) return fallbackNode;
		return null;
	}

	// 檢查是否為瀏覽器本地的 blob: 網址
	const isBlob = actualSrc.startsWith("blob:");

	let finalSrc = actualSrc;

	if (!isBlob) {
		// 只有非 Blob 網址才進行 Proxy 與 Discord 最佳化
		const isDiscord = actualSrc.includes("cdn.discordapp.com");
		const cleanUrl = actualSrc.split("?")[0];

		// 這裡套用 1024 倍數的計算（考量到 Retina 螢幕，傳入 width * 2 去計算最接近的倍數）
		const discordSize = calculateDiscordSize(width * 2);

		const optimizedUrl = isDiscord
			? `${cleanUrl}?size=${discordSize}`
			: actualSrc;

		finalSrc = getProxyImageUrl(optimizedUrl);
	}

	return (
		<Image
			{...(props as any)}
			src={finalSrc}
			alt={alt || "圖片"}
			width={width}
			height={height}
			layout={layout}
			className={className}
			background={isBlob ? "none" : "auto"} // Blob 通常是本地暫存，關閉背景預載避免閃爍或報錯
		/>
	);
}
