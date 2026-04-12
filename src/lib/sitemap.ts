export type SitemapChangeFreq =
	| "always"
	| "hourly"
	| "daily"
	| "weekly"
	| "monthly"
	| "yearly"
	| "never";

export type SitemapField = {
	loc: string;
	lastmod: string;
	changefreq: SitemapChangeFreq;
	priority: number;
};

function escapeXml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function clampPriority(priority: number): number {
	if (!Number.isFinite(priority)) return 0.3;
	if (priority < 0.1) return 0.1;
	if (priority > 1) return 1;
	return Number(priority.toFixed(2));
}

export function createPriorityCalculator(config: {
	voteWeight: number;
	serverWeight: number;
}) {
	return (
		input: { upvotes?: number | null; servers?: number | null },
		maxScore: number,
	): number => {
		const score =
			(input.upvotes ?? 0) * config.voteWeight +
			(input.servers ?? 0) * config.serverWeight;
		const normalized = maxScore > 0 ? score / maxScore : 0;
		const priority = 0.3 + normalized * 0.7;

		return clampPriority(priority);
	};
}

export function buildSitemapXml(fields: SitemapField[]): string {
	const body = fields
		.map(
			(field) =>
				`<url><loc>${escapeXml(field.loc)}</loc><lastmod>${escapeXml(field.lastmod)}</lastmod><changefreq>${field.changefreq}</changefreq><priority>${clampPriority(field.priority).toFixed(2)}</priority></url>`,
		)
		.join("");

	return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function createSitemapResponse(xml: string): Response {
	return new Response(xml, {
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control":
				"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
		},
	});
}
