import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserProfilePage } from "#/features/users/components/profile-page";
import type {
	ProfileSearch,
	ProfileTab,
} from "#/features/users/profile.schemas";
import { userProfileQueryOptions } from "#/features/users/users.query";

const PROFILE_TABS: readonly ProfileTab[] = [
	"servers",
	"bots",
	"favorites",
	"settings",
];

function parseProfileTab(value: unknown): ProfileTab | undefined {
	if (typeof value !== "string") return undefined;
	return PROFILE_TABS.includes(value as ProfileTab)
		? (value as ProfileTab)
		: undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute("/_protected/profile")({
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
	loader: async ({ context, deps, location }) => {
		const currentUserId = context.user?.id;

		if (!currentUserId) {
			throw redirect({
				to: "/",
				search: { redirect: location.href },
			});
		}

		const targetUserId = deps.viewedUserId ?? currentUserId;
		await context.queryClient.ensureQueryData(
			userProfileQueryOptions(targetUserId),
		);
		return {
			viewedUserId: targetUserId,
			currentUserId,
		};
	},
	pendingComponent: ProfilePending,
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
