export function getProxyImageUrl(originalUrl: string | null | undefined) {
  if (!originalUrl) return "/dchub.png"; // 回傳預設圖

  // 如果已經是本地圖片，直接回傳
  if (
    originalUrl.startsWith("/") ||
    originalUrl.startsWith("http://localhost") ||
    originalUrl.startsWith("https://dchubs.org")
  ) {
    return originalUrl;
  }

  // 將外部網址編碼後傳給 Proxy API
  return `/api/proxy?url=${encodeURIComponent(originalUrl)}`;
}
