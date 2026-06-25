import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ServerPublishPage } from "#/features/servers/components/ServerPublishPage";
import { serverPublishQueryOptions } from "#/features/servers/server-publish.query";

const siteUrl =
  (typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
  "https://dchubs.org";

export const Route = createFileRoute("/servers/$serverId/publish")({
  preload: false,
  staticData: { breadcrumb: "發布伺服器" },
  head: ({ match }) => {
    const publishTitle = "發布伺服器 | DiscordHubs";
    const publishCanonical = new URL(match.pathname, siteUrl).toString();

    return {
      meta: [{ title: publishTitle }],
      links: [{ rel: "canonical", href: publishCanonical }],
    };
  },
  // 👇 維持你的 loader，這是預先抓取資料與處理越權攔截的最佳位置
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(serverPublishQueryOptions(params.serverId));
    } catch (error) {
      console.error("權限檢查失敗:", error);

      throw redirect({
        to: "/servers/$serverId",
        params: { serverId: params.serverId },
      });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { serverId } = Route.useParams();

  // 👇 這裡會瞬間拿到資料，因為上面的 loader 已經幫忙 fetch 並寫入 cache 了
  const { data: bundle } = useSuspenseQuery(serverPublishQueryOptions(serverId));

  // 👇 根據後端回傳的狀態，決定是建立還是編輯
  const mode = bundle.isPublished ? "edit" : "create";

  // 👇 把 bundle 和 mode 乾淨地傳給真正的 UI 元件
  return <ServerPublishPage serverId={serverId} mode={mode} bundle={bundle} />;
}
