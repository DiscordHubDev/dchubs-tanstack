import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

const securityHeadersMiddleware = createMiddleware().server(
	async ({ next }) => {
		const result = await next();

		if (result?.response) {
			result.response.headers.set(
				"Content-Security-Policy",
				"default-src 'self'; script-src 'self' 'unsafe-inline' https://assets.dchubs.org https://ajax.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://assets.dchubs.org; img-src 'self' data: https://cdn.discordapp.com https://gallery.dawngs.top https://res.cloudinary.com blob:; frame-src https://discord.com https://www.youtube.com; connect-src 'self' https://cloudflareinsights.com",
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
		// 1. 如果不是 serverFn，不檢查
		if (ctx.handlerType !== "serverFn") return false;

		// 2. 檢查請求標頭中是否帶有機器人的專屬 Secret
		const authHeader = ctx.request.headers.get("Authorization");
		if (authHeader === `Bearer ${process.env.API_CRON_TOKEN}`) {
			return false; // 回傳 false 代表「跳過 CSRF 檢查」，放行機器人！
		}

		return true; // 其他一般使用者的請求，維持 CSRF 檢查
	},
});

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
	};
});
