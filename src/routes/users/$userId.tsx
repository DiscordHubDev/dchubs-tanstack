import { createFileRoute } from "@tanstack/react-router";
import { UserProfilePage } from "#/features/users/components/profile-page";
import type { ProfileTab } from "#/features/users/profile.schemas";
import { userProfileQueryOptions } from "#/features/users/users.query";
import { useSession } from "#/lib/auth-client";

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

function getSessionUserId(
	session: ReturnType<typeof useSession>["data"],
): string | null {
	return (
		session?.discordProfile?.id ??
		session?.user?.discordId ??
		session?.user?.id ??
		null
	);
}

export const Route = createFileRoute("/users/$userId")({
	ssr: false,
	validateSearch: (search): UserProfileSearch => {
		const tab = parseProfileTab(search.tab);
		return {
			...(tab ? { tab } : {}),
		};
	},
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			userProfileQueryOptions(params.userId),
		);
		return { viewedUserId: params.userId };
	},
	pendingComponent: ProfilePending,
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { viewedUserId } = Route.useLoaderData();
	const { data: session } = useSession();

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

function ProfilePending() {
	return (
		<div className="min-h-dvh flex items-center justify-center bg-[#2b2d31] text-white">
			<div className="text-center animate-pulse">
				<h2 className="text-2xl font-semibold mb-2">載入中...</h2>
				<p className="text-gray-400 text-sm">正在準備用戶資料...</p>
			</div>
		</div>
	);
}
