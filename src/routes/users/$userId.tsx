import { createFileRoute, notFound, useRouteContext } from "@tanstack/react-router";
import LoadingPage from "#/components/loading";
import { UserProfilePage } from "#/features/users/components/profile-page";
import type { ProfileTab } from "#/features/users/profile.schemas";
import { getUserIdByDiscordIdFn } from "#/features/users/users.functions";
import { userProfileQueryOptions } from "#/features/users/users.query";
import type { NormalizedSession } from "#/lib/auth.functions";

const PROFILE_TABS: readonly ProfileTab[] = ["servers", "bots", "favorites", "settings"];

type UserProfileSearch = {
  tab?: ProfileTab;
};

function parseProfileTab(value: unknown): ProfileTab | undefined {
  if (typeof value !== "string") return undefined;
  return PROFILE_TABS.includes(value as ProfileTab) ? (value as ProfileTab) : undefined;
}

function getSessionUserId(session: NormalizedSession | null): string | null {
  return session?.user?.id ?? null;
}

export const Route = createFileRoute("/users/$userId")({
  validateSearch: (search): UserProfileSearch => {
    const tab = parseProfileTab(search.tab);
    return tab ? { tab } : {};
  },
  ssr: false,
  preloadStaleTime: 10 * 60 * 1000,

  loader: async ({ context, params }) => {
    console.log("params.userId =", params.userId);
    const resolvedId = await getUserIdByDiscordIdFn({
      data: { discordId: params.userId },
    });

    console.log("resolvedId =", resolvedId);

    if (!resolvedId) {
      throw notFound();
    }

    await context.queryClient.ensureQueryData(userProfileQueryOptions(resolvedId));

    return { viewedUserId: resolvedId };
  },

  pendingComponent: () => (
    <LoadingPage loadingText="正在準備用戶資料..." subText="請稍候" loaderType="dots" />
  ),
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-[#1e1f22] text-white">
      <div className="text-center">
        <h2 className="mb-2 font-semibold text-2xl">找不到用戶</h2>
        <p className="text-gray-400 text-sm">用戶資料不存在或已被移除。</p>
      </div>
    </div>
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { viewedUserId } = Route.useLoaderData();
  const { session } = useRouteContext({ from: "__root__" });

  const activeTab = (search.tab ?? "servers") as ProfileTab;
  const currentUserId = getSessionUserId(session);

  return (
    <UserProfilePage
      viewedUserId={viewedUserId}
      currentUserId={currentUserId}
      activeTab={activeTab}
      onTabChange={(tab) => {
        navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            tab,
          }),
        });
      }}
    />
  );
}
