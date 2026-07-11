import { createFileRoute } from "@tanstack/react-router";
import { desc } from "drizzle-orm";
import { server } from "#/drizzle/schema";
import {
  buildSitemapXml,
  createPriorityCalculator,
  createSitemapResponse,
  type SitemapField,
} from "#/lib/sitemap";
import { getDb } from "#/drizzle/db";

const siteUrl =
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SITE_URL : undefined) ||
  "https://dchubs.org";

export const Route = createFileRoute("/api/sitemap/servers")({
  server: {
    handlers: {
      GET: async () => {
        const db = getDb();
        const servers = await db
          .select({
            id: server.id,
            createdAt: server.createdAt,
            upvotes: server.upvotes,
            members: server.members,
          })
          .from(server)
          .orderBy(desc(server.createdAt));

        const calcPriority = createPriorityCalculator({
          voteWeight: 0.6,
          serverWeight: 0.4,
        });

        const scores = servers.map((item) => (item.upvotes ?? 0) * 0.6 + (item.members ?? 0) * 0.4);
        const maxScore = Math.max(...scores, 1);

        const fields: SitemapField[] = servers.map((item) => ({
          loc: new URL(`/servers/${item.id}`, siteUrl).toString(),
          lastmod: new Date(item.createdAt || Date.now()).toISOString(),
          changefreq: "weekly",
          priority: calcPriority({ upvotes: item.upvotes, servers: item.members }, maxScore),
        }));

        return createSitemapResponse(buildSitemapXml(fields));
      },
    },
  },
});
