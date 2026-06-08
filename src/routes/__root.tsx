import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import React, { type ReactNode, Suspense } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { ErrorState } from "#/components/ErrorState";
import { GlobalAnnouncement } from "#/components/GlobalAnnouncement";
// --- Components & Layouts ---
import { AppSidebar } from "#/components/layout/app-sidebar";
import NotFound from "#/components/notFound";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { getGlobalAnnouncement } from "#/features/announcement/announcement.function";
// --- Utils & Assets ---
import { getSession, type NormalizedSession } from "#/lib/auth.functions";
import { TooltipProvider } from "@/components/ui/tooltip";
import Footer from "../components/Footer";
import Header from "../components/Header";
import appCss from "../styles.css?url";

// ==========================================
// 1. 型別與 Context 宣告 (集中管理，刪除檔案底部的重複宣告)
// ==========================================
export interface MyRouterContext {
	queryClient: QueryClient;
	session: NormalizedSession | null;
}

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		breadcrumb?: string;
	}
}

// ==========================================
// 2. 常數與全域設定
// ==========================================
const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;root.classList.remove('light');root.classList.add('dark');root.setAttribute('data-theme','dark');root.style.colorScheme='dark';window.localStorage.setItem('theme','dark');}catch(e){}})();`;

const keywords = [
	"熱門 Discord 伺服器",
	"中文 Discord 伺服器",
	"Discord 社群推薦",
	"Discord 伺服器排行",
	"有趣 Discord 群組",
	"免費 Discord 社群",
	"伺服器人氣推薦",
	"DiscordHubs 熱門伺服器",
];

const siteUrl = "https://dchubs.org";
const pageTitle = "熱門伺服器 | Discord伺服器列表 - DiscordHubs";
const pageDescription =
	"DiscordHubs是最佳的 Discord 中文伺服器和機器人列表平台，幫助您發現及宣傳伺服器，和加入有趣的社群群組和機器人，為伺服器增添功能和成員。";
const ogDescription =
	"DiscordHubs 是最優質的 Discord 中文伺服器與機器人列表平台，幫助你探索有趣社群、宣傳伺服器，並加入實用機器人，豐富你的伺服器功能與成員互動。";
const ogImage = new URL("/dchub.png", siteUrl).toString();
const canonicalUrl = new URL("/", siteUrl).toString();

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "Discord伺服器列表",
	url: siteUrl,
	description: pageDescription,
};

// 動態載入 Devtools
const Devtools = import.meta.env.DEV
	? React.lazy(() => import("#/components/devtools"))
	: () => null;

// ==========================================
// 3. Router Root 定義
// ==========================================
export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async () => {
		const session = await getSession();
		return { session };
	},
	loader: async () => {
		const res = await getGlobalAnnouncement();
		return {
			announcement: res.success ? res.data : null,
		};
	},
	head: ({ matches }) => {
		const breadcrumbMatches = matches.filter((m) => m.pathname !== "");

		const itemListElement = breadcrumbMatches.map((m, index) => {
			const isHome = m.pathname === "/"; // 判斷是否為首頁

			// @ts-expect-error - 動態捕捉 loaderData
			const dynamicName = m.loaderData?.detail?.name;
			const staticName = m.staticData?.breadcrumb;

			// 如果是首頁，預設給 "首頁"，否則才用網址後綴
			const fallbackName = isHome
				? "首頁"
				: m.pathname.split("/").filter(Boolean).pop() || "未命名";

			const name = dynamicName || staticName || fallbackName;
			const itemUrl = new URL(m.pathname, siteUrl).toString();

			return {
				"@type": "ListItem",
				position: index + 1,
				name: name,
				item: itemUrl,
			};
		});
		const breadcrumbJsonLd =
			itemListElement.length > 0
				? JSON.stringify({
						"@context": "https://schema.org",
						"@type": "BreadcrumbList",
						itemListElement: itemListElement,
					}).replace(/</g, "\\u003c") // 防止 XSS
				: null;

		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title: pageTitle },
				{ name: "description", content: pageDescription },
				{ name: "keywords", content: keywords.join("，") },
				{ name: "author", content: "DiscordHubs 團隊" },
				{ property: "og:title", content: pageTitle },
				{ property: "og:description", content: ogDescription },
				{ property: "og:url", content: siteUrl },
				{ property: "og:site_name", content: "DiscordHubs" },
				{ property: "og:image", content: ogImage },
				{
					property: "og:image:alt",
					content: "DiscordHubs Discord伺服器及機器人列表",
				},
				{ property: "og:locale", content: "zh-TW" },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: pageTitle },
				{ name: "twitter:description", content: ogDescription },
				{ name: "twitter:image", content: ogImage },
				{ name: "twitter:url", content: siteUrl },
			],
			links: [
				{ rel: "preconnect", href: "https://assets.dchubs.org" },
				{ rel: "dns-prefetch", href: "https://assets.dchubs.org" },
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", href: "/favicon.ico" },
				{ rel: "icon", type: "image/png", href: "/icon.png" },
				{ rel: "canonical", href: canonicalUrl },
			],
			scripts: breadcrumbJsonLd
				? [
						{
							type: "application/ld+json",
							children: breadcrumbJsonLd,
						},
					]
				: [],
		};
	},
	shellComponent: RootDocument,
	errorComponent: ({ error }) => <ErrorState error={error} />,
	notFoundComponent: NotFound,
});

// ==========================================
// 4. 根文檔元件
// ==========================================
function RootDocument({ children }: { children: ReactNode }) {
	const { announcement } = Route.useLoaderData();
	return (
		<html
			lang="zh-TW"
			className="dark"
			data-theme="dark"
			style={{ colorScheme: "dark" }}
			suppressHydrationWarning
		>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Just Theme */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<script
					type="application/ld+json"
					suppressHydrationWarning
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Embedding JSON-LD
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
				<HeadContent />
			</head>
			<body className="wrap-anywhere flex min-h-screen flex-col font-sans antialiased selection:bg-[rgba(79,184,178,0.24)] bg-[#2b2d31]">
				<SidebarProvider className="flex-col">
					<Header />
					<div className="flex-1">
						<TooltipProvider>
							<main className="page-wrap flex items-start">
								<AppSidebar className="w-64 shrink-0" />
								<SidebarInset className="flex grow flex-col overflow-x-hidden">
									{/* {announcement && (
										<GlobalAnnouncement content={announcement.content} />
									)} */}
									{children}
									<ToastContainer />
								</SidebarInset>
							</main>
						</TooltipProvider>
					</div>
					<Footer />
				</SidebarProvider>
				<Suspense fallback={null}>
					<Devtools />
				</Suspense>
				<Scripts />
			</body>
		</html>
	);
}
