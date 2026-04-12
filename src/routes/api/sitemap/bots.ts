import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/drizzle/db";
import { bot } from "#/drizzle/schema";
import {
	buildSitemapXml,
	createPriorityCalculator,
	createSitemapResponse,
	type SitemapField,
} from "#/lib/sitemap";

const siteUrl =
	(typeof process !== "undefined"
		? process.env.NEXT_PUBLIC_SITE_URL
		: undefined) || "https://dchubs.org";

export const Route = createFileRoute("/api/sitemap/bots")({
	server: {
		handlers: {
			GET: async () => {
				const bots = await db
					.select({
						id: bot.id,
						createdAt: bot.createdAt,
						upvotes: bot.upvotes,
						servers: bot.servers,
					})
					.from(bot)
					.where(and(eq(bot.status, "approved")))
					.orderBy(desc(bot.createdAt));

				const calcPriority = createPriorityCalculator({
					voteWeight: 0.7,
					serverWeight: 0.3,
				});

				const scores = bots.map(
					(item) => (item.upvotes ?? 0) * 0.6 + (item.servers ?? 0) * 0.4,
				);
				const maxScore = Math.max(...scores, 1);

				const fields: SitemapField[] = bots.map((item) => ({
					loc: new URL(`/bots/${item.id}`, siteUrl).toString(),
					lastmod: new Date(item.createdAt || Date.now()).toISOString(),
					changefreq:
						item.upvotes > 500
							? "daily"
							: item.upvotes > 100
								? "weekly"
								: "monthly",
					priority: calcPriority(
						{ upvotes: item.upvotes, servers: item.servers },
						maxScore,
					),
				}));

				return createSitemapResponse(buildSitemapXml(fields));
			},
		},
	},
});
