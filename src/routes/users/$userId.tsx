import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import LoadingPage from "#/components/loading";
import { UserProfilePage } from "#/features/users/components/profile-page";
import type { ProfileTab } from "#/features/users/profile.schemas";
import { userProfileQueryOptions } from "#/features/users/users.query";
import type { NormalizedSession } from "#/lib/auth.functions";

const PROFILE_TABS: readonly ProfileTab[] = [
	"servers",
	"bots",
	"favorites",
	"settings",
];

type UserProfileSearch = {
	tab?: ProfileTab;
};

function parseProfileTab(value: unknown): ProfileTab | undefined {
	if (typeof value !== "string") return undefined;
	return PROFILE_TABS.includes(value as ProfileTab)
		? (value as ProfileTab)
		: undefined;
}

function getSessionUserId(session: NormalizedSession | null): string | null {
	return (
		session?.discordProfile?.id ??
		session?.user?.discordId ??
		session?.user?.id ??
		null
	);
}

export const Route = createFileRoute("/users/$userId")({
	ssr: false,
	preloadStaleTime: 10 * 60 * 1000,
	validateSearch: (search): UserProfileSearch => {
		const tab = parseProfileTab(search.tab);
		return tab ? { tab } : {};
	},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			userProfileQueryOptions(params.userId),
		);
		return { viewedUserId: params.userId };
	},
	pendingComponent: () => (
		<LoadingPage
			loadingText="正在準備用戶資料..."
			subText="請稍候"
			loaderType="dots"
		/>
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
