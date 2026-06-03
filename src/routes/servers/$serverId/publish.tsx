import { createFileRoute, redirect } from "@tanstack/react-router";
import { ServerPublishPage } from "#/features/servers/components/ServerPublishPage";
import { serverPublishQueryOptions } from "#/features/servers/server-publish.query";

const siteUrl =
	(typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
	"https://dchubs.org";

export const Route = createFileRoute("/servers/$serverId/publish")({
	preload: false,
	head: ({ match }) => {
		const publishTitle = "發布伺服器 | DiscordHubs";
		const publishCanonical = new URL(match.pathname, siteUrl).toString();

		return {
			meta: [{ title: publishTitle }],
			links: [{ rel: "canonical", href: publishCanonical }],
		};
	},
	loader: async ({ context, params }) => {
		try {
			// 當這個 query 觸發時，會呼叫後端的 Server Fn
			await context.queryClient.ensureQueryData(
				serverPublishQueryOptions(params.serverId),
			);
		} catch (error) {
			console.error("權限檢查失敗:", error);

			throw redirect({
				to: "/servers/$serverId",
				params: { serverId: params.serverId },
			});
		}

		return null;
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { serverId } = Route.useParams();

	return <ServerPublishPage serverId={serverId} />;
}
