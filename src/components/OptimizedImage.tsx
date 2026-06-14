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
		const optimizedUrl = isDiscord
			? `${cleanUrl}?size=${width * 2}`
			: actualSrc;

		finalSrc = getProxyImageUrl(optimizedUrl);
	}

	return (
		<Image
			{...(props as any)}
			src={finalSrc}
			cdn="none"
			alt={alt || "圖片"}
			width={width}
			height={height}
			layout={layout}
			className={className}
			background={isBlob ? "none" : "auto"} // Blob 通常是本地暫存，關閉背景預載避免閃爍或報錯
		/>
	);
}
