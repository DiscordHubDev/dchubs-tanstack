import { createFileRoute } from "@tanstack/react-router";
import TermsPage from "#/components/terms";

const baseUrl =
	process.env.BETTER_AUTH_URL ||
	process.env.SITE_URL ||
	process.env.VITE_SITE_URL ||
	"http://localhost:3000";

export const Route = createFileRoute("/terms")({
	head: () => ({
		meta: [
			{ title: "使用條款 | DiscordHubs" },
			{ name: "description", content: "DiscordHubs平台的服務使用條款說明" },
			// Open Graph (OG) Meta Tags，增強社群分享預覽
			{ property: "og:title", content: "使用條款 | DiscordHubs" },
			{
				property: "og:description",
				content: "DiscordHubs平台的服務使用條款說明",
			},
			{ property: "og:url", content: `${baseUrl}/terms` },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "DiscordHubs" },
		],
		scripts: [
			{
				type: "application/ld+json",
				// 使用 children 直接傳入 JSON 字串
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "WebPage",
					name: "Discord伺服器列表",
					description: "DiscordHubs平台的服務使用條款說明",
					url: `${baseUrl}/terms`,
					breadcrumb: {
						"@type": "BreadcrumbList",
						itemListElement: [
							{
								"@type": "ListItem",
								position: 1,
								name: "首頁",
								item: baseUrl,
							},
							{
								"@type": "ListItem",
								position: 2,
								name: "服務條款",
								item: `${baseUrl}/terms`,
							},
						],
					},
					isPartOf: {
						"@type": "WebSite",
						name: "DiscordHubs",
						url: baseUrl,
					},
				}),
			},
		],
	}),
	component: TermsPage,
});
