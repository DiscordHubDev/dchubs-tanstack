import { createFileRoute, redirect } from "@tanstack/react-router";
import LoadingPage from "#/components/loading";
import { UserProfilePage } from "#/features/users/components/profile-page";
import type { ProfileSearch, ProfileTab } from "#/features/users/profile.schemas";
import { userProfileQueryOptions } from "#/features/users/users.query";
import { checkAuthServerFn } from "#/lib/auth.functions";

const PROFILE_TABS: readonly ProfileTab[] = ["servers", "bots", "favorites", "settings"];

function parseProfileTab(value: unknown): ProfileTab | undefined {
  if (typeof value !== "string") return undefined;
  return PROFILE_TABS.includes(value as ProfileTab) ? (value as ProfileTab) : undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const siteUrl =
  (typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
  "https://dchubs.org";

export const Route = createFileRoute("/protected/profile")({
  ssr: false,
  preloadStaleTime: 10 * 60 * 1000,

  validateSearch: (search): ProfileSearch => {
    const id = parseNonEmptyString(search.id);
    const tab = parseProfileTab(search.tab);

    return {
      ...(id ? { id } : {}),
      ...(tab ? { tab } : {}),
    };
  },

  loaderDeps: ({ search }) => ({
    viewedUserId: search.id,
  }),

  beforeLoad: async ({ location }) => {
    const authStatus = await checkAuthServerFn();

    if (!authStatus.isAuthenticated || !authStatus.userId) {
      throw redirect({
        to: "/",
        search: { redirect: location.href },
      });
    }

    return { currentUserId: authStatus.userId };
  },

  loader: async ({ context, deps }) => {
    const currentUserId = context.currentUserId;

    const targetUserId = deps.viewedUserId ?? currentUserId;

    await context.queryClient.ensureQueryData(userProfileQueryOptions(targetUserId));

    return {
      viewedUserId: targetUserId,
      currentUserId,
    };
  },

  head: ({ match }) => {
    const publishTitle = "個人頁面 | DiscordHubs";
    const publishCanonical = new URL(match.pathname, siteUrl).toString();

    return {
      meta: [{ title: publishTitle }],
      links: [{ rel: "canonical", href: publishCanonical }],
    };
  },

  pendingComponent: () => (
    <LoadingPage loadingText="正在準備用戶資料..." subText="請稍候" loaderType="dots" />
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { viewedUserId, currentUserId } = Route.useLoaderData();

  const activeTab = (search.tab ?? "servers") as ProfileTab;

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

function _ProfilePending() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#2b2d31] text-white">
      <div className="animate-pulse text-center">
        <h2 className="mb-2 font-semibold text-2xl">載入中...</h2>
        <p className="text-gray-400 text-sm">正在準備用戶資料...</p>
      </div>
    </div>
  );
}
