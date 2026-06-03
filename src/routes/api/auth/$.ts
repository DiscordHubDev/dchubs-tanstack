import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "#/lib/auth"; // 🚀 改為頂層靜態引入

// 🚀 在模組載入時，直接觸發非同步初始化，不等請求進來！
// 這樣做可以確保在 HTTP 請求真正到達 GET/POST 之前，Better Auth 實例極可能已經建立完畢
const authTopLevelPromise = getAuth();

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// 直接 await 頂層已經在跑（或跑完）的 Promise
				const auth = await authTopLevelPromise;
				return auth.handler(request);
			},
			POST: async ({ request }) => {
				const auth = await authTopLevelPromise;
				return auth.handler(request);
			},
		},
	},
});
