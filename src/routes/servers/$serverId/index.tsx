import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ServerDetailPage } from "#/features/servers/components/ServerDetailPage";
import { serverDetailQueryOptions } from "#/features/servers/server-detail.query";
import type { ServerDetailSearch } from "#/features/servers/server-detail.schemas";
import type { ServerDetail, ServerDetailTab } from "#/features/servers/server-detail.types";

const DEFAULT_SERVER_ICON_URL = "https://cdn.discordapp.com/embed/avatars/0.png";
const SERVER_DETAIL_TABS: readonly ServerDetailTab[] = ["about", "rules", "screenshots"];
const siteUrl =
  (typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
  "https://dchubs.org";

function createServerMetaTitle(detail: ServerDetail): string {
  const tagLabel = detail.tags.slice(0, 2).join(" / ");
  if (!tagLabel) {
    return `${detail.name} Discord 伺服器 | DiscordHubs`;
  }

  return `${detail.name} - ${tagLabel} Discord 伺服器 | DiscordHubs`;
}

function createServerHead(detail: ServerDetail | null, serverId: string) {
  if (!detail) {
    const fallbackTitle = "找不到伺服器 | DiscordHubs"; // 依照要求保留 DiscordHubs
    const fallbackDescription =
      "此伺服器可能不存在或目前無法顯示，請返回列表探索更多 Discord 社群。";
    const fallbackCanonical = new URL(`/servers/${serverId}`, siteUrl).toString();
    const fallbackImage = new URL("/dchub.png", siteUrl).toString();

    return {
      meta: [
        { title: fallbackTitle },
        { name: "description", content: fallbackDescription },
        { property: "og:title", content: fallbackTitle },
        { property: "og:description", content: fallbackDescription },
        { property: "og:url", content: fallbackCanonical },
        { property: "og:site_name", content: "DiscordHubs" },
        { property: "og:image", content: fallbackImage },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: fallbackTitle },
        { name: "twitter:description", content: fallbackDescription },
        { name: "twitter:image", content: fallbackImage },
        { name: "twitter:url", content: fallbackCanonical }, // 補上 twitter:url 以防第三方爬蟲抓取落差
      ],
      links: [{ rel: "canonical", href: fallbackCanonical }],
    };
  }

  const metaTitle = createServerMetaTitle(detail);
  const metaDescription = detail.description;
  const canonicalUrl = new URL(`/servers/${detail.id}`, siteUrl).toString();

  const isDefaultIcon = !detail.icon || detail.icon === DEFAULT_SERVER_ICON_URL;
  const hasCustomIcon = Boolean(detail.icon) && !isDefaultIcon;
  const hasBanner = Boolean(detail.banner);

  let previewImage: string | undefined;
  let twitterCard: "summary" | "summary_large_image" = "summary";

  if (hasCustomIcon) {
    previewImage = detail.icon ?? undefined;
    twitterCard = "summary";
  } else if (hasBanner) {
    previewImage = detail.banner ?? undefined;
    twitterCard = "summary_large_image";
  }

  const ogImage = previewImage ?? new URL("/dchub.png", siteUrl).toString();

  const serverJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SocialNetworkingService",
    name: detail.name,
    description: detail.description,
    url: canonicalUrl, // 直接複用上方宣告好的標準網址，避免重複構造
    image: detail.icon || DEFAULT_SERVER_ICON_URL,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: {
          "@type": "LikeAction",
        },
        userInteractionCount: detail.upvotes,
      },
      {
        "@type": "InteractionCounter",
        interactionType: {
          "@type": "JoinAction",
        },
        userInteractionCount: detail.members,
      },
    ],
  }).replace(/</g, "\\u003c");

  return {
    meta: [
      { title: metaTitle },
      { name: "description", content: metaDescription },
      { name: "keywords", content: detail.tags.join("，") },
      { property: "og:title", content: metaTitle },
      { property: "og:description", content: metaDescription },
      { property: "og:url", content: canonicalUrl },
      { property: "og:site_name", content: "DiscordHubs" },
      { property: "og:image", content: ogImage },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: twitterCard },
      { name: "twitter:title", content: metaTitle },
      { name: "twitter:description", content: metaDescription },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:url", content: canonicalUrl },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }], // 這裡會動態注入到前端
    staticData: { breadcrumb: metaTitle },
    scripts: [
      {
        type: "application/ld+json",
        children: serverJsonLd,
      },
    ],
  };
}

function validateSearch(search: Record<string, unknown>): ServerDetailSearch {
  const tab =
    typeof search.tab === "string" && SERVER_DETAIL_TABS.includes(search.tab as ServerDetailTab)
      ? (search.tab as ServerDetailTab)
      : undefined;

  return tab ? { tab } : {};
}

export const Route = createFileRoute("/servers/$serverId/")({
  validateSearch,
  head: ({ loaderData, params, match }) => {
    // 1. 處理子路徑 (/publish) 的靜態 Meta
    if (match.pathname.endsWith("/publish")) {
      const publishTitle = "發布伺服器 | DiscordHubs";
      const publishCanonical = new URL(match.pathname, siteUrl).toString();

      return {
        meta: [
          { title: publishTitle },
          { property: "og:title", content: publishTitle },
          { property: "og:url", content: publishCanonical },
        ],
        links: [{ rel: "canonical", href: publishCanonical }],
      };
    }

    // 2. 取得伺服器詳細資料
    const detail = (loaderData as { detail: ServerDetail | null } | undefined)?.detail ?? null;

    // 3. 直接回傳 createServerHead 的結果！
    // 因為你修改後的 createServerHead 已經完美包含了 Meta, Links 以及 JSON-LD Scripts
    return createServerHead(detail, params.serverId);
  },

  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(
      serverDetailQueryOptions(params.serverId),
    );
    return { detail };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const location = useLocation();

  if (location.pathname.endsWith("/publish")) {
    return <Outlet />;
  }

  return <ServerDetailPage />;
}
