import crypto from "node:crypto";
import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

const securityHeadersMiddleware = createMiddleware().server(
	async ({ next }) => {
		// 1. 在處理請求前，先生成這次專屬的隨機 Nonce
		const nonce = crypto.randomBytes(16).toString("base64");

		// 2. 執行後續的渲染與請求，並將 nonce 注入到 context 中讓前端 React 可以讀取
		const result = await next({
			context: { nonce },
		});

		if (result?.response) {
			// 判斷是否為開發環境：開發環境用 Report-Only 避免畫面直接壞掉，正式環境再強制阻擋
			const isDev = process.env.NODE_ENV === "development"; // 或使用 import.meta.env.DEV
			const cspHeaderName = isDev
				? "Content-Security-Policy-Report-Only"
				: "Content-Security-Policy";

			// 3. 組合 CSP：將你的網域白名單與 Nonce 結合
			const cspDirectives = [
				"default-src 'self'",

				// 🟢 修正 1: 移除 'strict-dynamic'。
				// 保留 'self' 與 CDN 網域，並加上 'unsafe-inline' 與 'unsafe-eval' 以防 React/Vite 內部依賴
				"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.dchubs.org https://ajax.cloudflare.com https://static.cloudflareinsights.com",

				// 🟢 修正 2: 確保 style 也允許你的 CDN 與 inline-style (Shadcn 有時會用到動態 style)
				"style-src 'self' 'unsafe-inline' https://assets.dchubs.org",

				// 以下維持你的設定
				"img-src 'self' data: https://cdn.discordapp.com https://gallery.dawngs.top https://res.cloudinary.com blob:",
				"frame-src https://discord.com https://www.youtube.com",
				"connect-src 'self' https://cloudflareinsights.com",
				"object-src 'none'",
				"frame-ancestors 'self'",
				"base-uri 'self'",
			].join("; ");

			// 寫入 CSP
			result.response.headers.set(cspHeaderName, cspDirectives);

			// 寫入其他安全標頭 (XFO, CORP, HSTS 等)
			result.response.headers.set("X-Frame-Options", "SAMEORIGIN");
			result.response.headers.set(
				"Cross-Origin-Resource-Policy",
				"same-origin",
			);
			result.response.headers.set(
				"Strict-Transport-Security",
				"max-age=31536000; includeSubDomains; preload",
			);
			result.response.headers.set("X-Content-Type-Options", "nosniff");
		}

		return result;
	},
);

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => {
		if (ctx.handlerType !== "serverFn") return false;

		const authHeader = ctx.request.headers.get("Authorization");
		if (authHeader === `Bearer ${process.env.API_CRON_TOKEN}`) {
			return false; // 放行機器人
		}

		return true;
	},
});

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
	};
});
