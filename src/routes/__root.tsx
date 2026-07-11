import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import React, { type ReactNode, Suspense } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { ErrorState } from "#/components/ErrorState";
// --- Components & Layouts ---
import { AppSidebar } from "#/components/layout/app-sidebar";
import NotFound from "#/components/notFound";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
// --- Utils & Assets ---
import { getSession, type NormalizedSession } from "#/lib/auth.functions";
import { TooltipProvider } from "@/components/ui/tooltip";
import Footer from "../components/Footer";
import Header from "../components/Header";
import appCss from "../styles.css?url";

// ==========================================
// 1. 型別與 Context 宣告
// ==========================================
export interface MyRouterContext {
  queryClient: QueryClient;
  session: NormalizedSession | null;
  status: "authenticated" | "loading" | "unauthenticated";
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

const VITE_PRELOAD_ERROR_SCRIPT = `
  window.addEventListener('vite:preloadError', function(event) {
    console.warn('偵測到資源預載入失敗，正在強制重新整理以獲取最新版本...');
    window.location.reload();
  });
`;

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
    // 1. 取得後端 session 狀態
    const session = await getSession();

    // 2. 根據 session 是否有值，決定 status 的狀態
    // 因為 beforeLoad 是在路由載入時執行，執行完畢後狀態非黑即白
    const status = session ? "authenticated" : "unauthenticated";

    // 3. 回傳的物件會被淺合併 (Shallow Merge) 到 Router Context 中
    return {
      session,
      status,
    };
  },
  head: ({ matches }) => {
    // 檢查目前的最深層匹配路由是不是首頁
    const currentMatch = matches[matches.length - 1];
    const isExactHome = currentMatch?.pathname === "/";

    const breadcrumbMatches = matches.filter((m) => m.pathname !== "");

    const itemListElement = breadcrumbMatches.map((m, index) => {
      const isHome = m.pathname === "/";

      // @ts-expect-error - 動態捕捉 loaderData
      const dynamicName = m.loaderData?.detail?.name;
      const staticName = m.staticData?.breadcrumb;

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
          }).replace(/</g, "\\u003c")
        : null;

    // 基礎的連結宣告
    const baseLinks = [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", href: "/icon.png" },
    ];

    // ✨ 關鍵修正：只有當真正處於「首頁」時，全域根路由才主動發送首頁的 canonicalUrl
    if (isExactHome) {
      baseLinks.push({
        rel: "canonical",
        href: new URL("/", siteUrl).toString(),
      });
    }

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
      links: baseLinks, // 使用動態處理後的 links 陣列
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
  return (
    <html
      lang="zh-TW"
      className="dark"
      data-theme="dark"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml:  reload when deployment fails or new deployment
          dangerouslySetInnerHTML={{ __html: VITE_PRELOAD_ERROR_SCRIPT }}
        />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Just Theme */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Embedding JSON-LD
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <HeadContent />
      </head>
      <body className="wrap-anywhere flex min-h-screen flex-col bg-[#2b2d31] font-sans antialiased selection:bg-[rgba(79,184,178,0.24)]">
        <SidebarProvider className="flex-col">
          <Header />
          <div className="flex-1">
            <TooltipProvider>
              <main className="page-wrap flex items-start">
                <AppSidebar className="w-64 shrink-0" />
                <SidebarInset className="flex grow flex-col overflow-x-hidden">
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
