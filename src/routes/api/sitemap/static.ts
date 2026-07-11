import { createFileRoute } from "@tanstack/react-router";
import { buildSitemapXml, createSitemapResponse, type SitemapField } from "#/lib/sitemap";
import { env } from "cloudflare:workers";

const siteUrl = env.BETTER_AUTH_URL || "https://dchubs.org";

export const Route = createFileRoute("/api/sitemap/static")({
  server: {
    handlers: {
      GET: async () => {
        const nowIso = new Date().toISOString();
        const routes = ["/", "/tutorial", "/bots", "/login", "/terms", "/privacy"];

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
