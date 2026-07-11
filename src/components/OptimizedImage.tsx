import { getProxyImageUrl } from "#/utils/image";
import { Image } from "@unpic/react";
import type { ImgHTMLAttributes, ReactNode } from "react";

interface OptimizedImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "placeholder"
> {
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
  // Discord 支援的 size 參數通常是 2 的冪次方 (16, 32, 64, 128, 256, 512, 1024, 2048, 4096)
  const sizes = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

  // 找到第一個大於等於目標寬度的尺寸
  return sizes.find((s) => s >= targetWidth) || 1024;
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
    return fallbackNode || null;
  }

  const isBlob = actualSrc.startsWith("blob:");
  const isDiscord = actualSrc.includes("cdn.discordapp.com");

  let finalSrc = actualSrc;

  if (isBlob) {
    // Blob 保持原樣
    finalSrc = actualSrc;
  } else if (isDiscord) {
    // Discord 圖片：處理 size 參數
    const cleanUrl = actualSrc.split("?")[0];
    const discordSize = calculateDiscordSize(width * 2);
    finalSrc = `${cleanUrl}?size=${discordSize}`;
  } else {
    // 其他外部圖片：透過您現有的 Proxy 進行優化
    finalSrc = getProxyImageUrl(actualSrc);
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
      background={isBlob ? "none" : "auto"}
    />
  );
}
