import { createFileRoute } from "@tanstack/react-router";
import {
	buildSitemapXml,
	createSitemapResponse,
	type SitemapField,
} from "#/lib/sitemap";

const siteUrl =
	(typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
	"https://dchubs.org";

export const Route = createFileRoute("/api/sitemap/static")({
	server: {
		handlers: {
			GET: async () => {
				const nowIso = new Date().toISOString();
				const routes = [
					"/",
					"/help",
					"/bots",
					"/servers",
					"/sign-in",
					"/terms",
					"/privacy",
					"/add-bot",
					"/add-server",
				];

				const fields: SitemapField[] = routes.map((route) => ({
					loc: new URL(route, siteUrl).toString(),
					lastmod: nowIso,
					changefreq: "daily",
					priority: route === "/" ? 1 : 0.7,
				}));

				return createSitemapResponse(buildSitemapXml(fields));
			},
		},
	},
});
