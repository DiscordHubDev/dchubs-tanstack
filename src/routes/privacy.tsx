import { createFileRoute } from "@tanstack/react-router";
import PrivacyPage from "#/components/privacy";

const baseUrl =
	process.env.BETTER_AUTH_URL ||
	process.env.SITE_URL ||
	process.env.VITE_SITE_URL ||
	"http://localhost:3000";

export const Route = createFileRoute("/privacy")({
	head: () => ({
		staticData: {
			breadcrumb: "隱私權政策",
		},
		meta: [
			{ title: "隱私權政策 | DiscordHubs" },
			{
				name: "description",
				content:
					"DiscordHubs 的隱私權政策。了解我們如何收集、使用及保護您的帳號資訊與伺服器數據，並說明您對個人資料擁有的權利。",
			},
			{
				name: "keywords",
				content: "DiscordHubs, 隱私權政策, Privacy Policy, Discord 機器人",
			},
			// Open Graph / Facebook / Discord
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: "隱私權政策 | DiscordHubs" },
			{
				property: "og:description",
				content:
					"了解 DiscordHubs 如何收集、使用及保護您的個人資訊與 Discord 伺服器數據。",
			},
			{ property: "og:url", content: `${baseUrl}/privacy` },
			{ property: "og:image", content: `${baseUrl}/og-image.png` },
			// Twitter Card
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: "隱私權政策 | DiscordHubs" },
			{
				name: "twitter:description",
				content:
					"了解 DiscordHubs 如何收集、使用及保護您的個人資訊與 Discord 伺服器數據。",
			},
			{ name: "twitter:image", content: `${baseUrl}/og-image.png` },
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "WebPage",
					name: "隱私權政策 | DiscordHubs",
					description:
						"DiscordHubs 的隱私權政策，詳細說明我們如何收集、使用、披露和保護您的個人資訊，以及您的隱私權利。",
					url: `${baseUrl}/privacy`,
					dateModified: "2026-06-04",
					inLanguage: "zh-TW",
					publisher: {
						"@type": "Organization",
						name: "DiscordHubs",
						url: `${baseUrl}`,
						contactPoint: {
							"@type": "ContactPoint",
							email: "support@dchubs.org",
							contactType: "Customer Support",
							availableLanguage: ["zh-TW", "en"],
						},
					},
				}).replace(/</g, "\\u003c"),
			},
		],
	}),
	component: PrivacyPage,
});
