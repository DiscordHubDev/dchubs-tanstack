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
				"default-src 'self'; script-src 'self' 'unsafe-inline' https://assets.dchubs.org https://ajax.cloudflare.com; style-src 'self' 'unsafe-inline' https://assets.dchubs.org; img-src 'self' data: https://cdn.discordapp.com https://gallery.dawngs.top https://res.cloudinary.com; frame-src https://discord.com;",
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
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
	};
});
