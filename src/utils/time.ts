export function formatTime(dateString: string | number | Date): string {
  const date = new Date(dateString);
  const now = new Date();

  // 計算相差的秒數
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

  // 定義時間單位的秒數，並明確指定 unit 的型別
  const units: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2592000 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];

  // 初始化瀏覽器的相對時間格式化工具
  const rtf = new Intl.RelativeTimeFormat("zh-TW", { numeric: "auto" });

  // 尋找符合的時間區間
  for (const { unit, seconds } of units) {
    if (Math.abs(diffInSeconds) >= seconds || unit === "second") {
      const value = Math.round(diffInSeconds / seconds);
      return rtf.format(value, unit);
    }
  }

  return ""; // 雖然邏輯上一定會進到 unit === 'second'，但加上這行可滿足 TS 的 return 檢查
}
