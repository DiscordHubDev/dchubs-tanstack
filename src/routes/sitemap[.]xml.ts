import { createFileRoute } from "@tanstack/react-router";
import { createSitemapResponse } from "#/lib/sitemap";

const siteUrl = import.meta.env.VITE_SITE_URL || "https://dchubs.org";

function buildSitemapIndexXml(urls: string[]): string {
  const body = urls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = [
          new URL("/api/sitemap/static", siteUrl).toString(),
          new URL("/api/sitemap/servers", siteUrl).toString(),
          new URL("/api/sitemap/bots", siteUrl).toString(),
        ];

        return createSitemapResponse(buildSitemapIndexXml(urls));
      },
    },
  },
});
