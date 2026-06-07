import { createFileRoute } from "@tanstack/react-router";
import TutorialPage from "#/components/tutorial";

const baseUrl =
	process.env.BETTER_AUTH_URL ||
	process.env.SITE_URL ||
	process.env.VITE_SITE_URL ||
	"http://localhost:3000";

const seoMeta = [
	{ title: "使用教學 | DiscordHubs - 探索優質 Discord 伺服器與機器人" },
	{
		name: "description",
		content:
			"了解如何充分利用 DiscordHubs 平台！本指南詳細介紹如何尋找、新增及推廣您的 Discord 伺服器與機器人，同時解答有關審核時間、投票系統與冷卻時間等常見問題。",
	},
	{
		name: "keywords",
		content:
			"DiscordHubs, Discord 伺服器, Discord 機器人, 使用教學, 常見問題, 伺服器推廣, 機器人推薦, DCHUB, dchubs, Discord 社群, 伺服器列表, 機器人列表",
	},

	// Open Graph / Facebook
	{ property: "og:type", content: "article" },
	{ property: "og:title", content: "使用教學 | DiscordHubs" },
	{
		property: "og:description",
		content:
			"探索、新增與管理您的 Discord 內容。最完整的 DiscordHubs 平台使用指南與 FAQ。",
	},
	{ property: "og:url", content: `${baseUrl}/tutorial` }, // 請替換為你的實際網域
	{ property: "og:image", content: `${baseUrl}/favicon.ico` }, // 請替換為你的網頁預覽圖

	// Twitter Card
	{ name: "twitter:card", content: "summary_large_image" },
	{ name: "twitter:title", content: "使用教學 | DiscordHubs" },
	{
		name: "twitter:description",
		content:
			"探索、新增與管理您的 Discord 內容。最完整的 DiscordHubs 平台使用指南與 FAQ。",
	},
	{ name: "twitter:image", content: `${baseUrl}/favicon.ico` },
];

const jsonLd = {
	type: "application/ld+json",
	children: JSON.stringify([
		{
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: [
				{
					"@type": "Question",
					name: "頁面中那些熱門、精選、票選、最新等都是什麼意思？代表什麼？",
					acceptedAnswer: {
						"@type": "Answer",
						text: "熱門：按成員或伺服器數降序排序。精選：結合成員數與投票數降序排序。票選：按投票數降序排序。最新：按平台發佈時間升序排序。已驗證：官方驗證機器人按發佈時間升序排序。所有：收錄內容按發佈時間降序排序。",
					},
				},
				{
					"@type": "Question",
					name: "我需要付費才能使用 DiscordHubs 嗎？",
					acceptedAnswer: {
						"@type": "Answer",
						text: "不需要，DiscordHubs 是完全免費的平台。您可以免費瀏覽、添加伺服器和機器人，以及使用所有功能。",
					},
				},
				{
					"@type": "Question",
					name: "我的伺服器或機器人需要多久才能被審核通過？",
					acceptedAnswer: {
						"@type": "Answer",
						text: "通常情況下會在 1-2 個工作日內完成審核，較忙時可能需要等待至 7 天。如果久未收到通知，可至官方群組開啟客服單查詢。",
					},
				},
				{
					"@type": "Question",
					name: "為什麼我的伺服器或機器人被拒絕了？",
					acceptedAnswer: {
						"@type": "Answer",
						text: "可能原因包括：違反 Discord 官方或本站社群準則、資訊不完整、邀請連結無效或內容不適當。您可以修改後重新提交。",
					},
				},
				{
					"@type": "Question",
					name: "如何提高我的伺服器或機器人在列表中的排名？",
					acceptedAnswer: {
						"@type": "Answer",
						text: "獲得更多的投票或置頂是提高排名的主要方式。每 12 小時可投一次票或置頂，您可以邀請社群成員參與支持。",
					},
				},
			],
		},
		// 2. HowTo (教學步驟) 結構化資料 - 新增伺服器
		{
			"@context": "https://schema.org",
			"@type": "HowTo",
			name: "如何在 DiscordHubs 新增 Discord 伺服器",
			description:
				"分享並推廣您的 Discord 伺服器到 DiscordHubs 平台的完整步驟。",
			step: [
				{ "@type": "HowToStep", text: "登入您的 DiscordHubs 帳號" },
				{
					"@type": "HowToStep",
					text: "點擊頂部導航欄或菜單的「新增伺服器」按鈕",
				},
				{
					"@type": "HowToStep",
					text: "填寫伺服器資訊，包括名稱、描述、標籤和邀請連結",
				},
				{
					"@type": "HowToStep",
					text: "發佈伺服器需要邀請官方機器人 DCHUB 以確認權限",
				},
				{ "@type": "HowToStep", text: "提交表單即可完成發佈" },
			],
		},
	]).replace(/</g, "\\u003c"),
};

export const Route = createFileRoute("/tutorial")({
	component: TutorialPage,
	staticData: {
		breadcrumb: "教學",
	},
	head: () => ({ meta: seoMeta, scripts: [jsonLd] }),
});
