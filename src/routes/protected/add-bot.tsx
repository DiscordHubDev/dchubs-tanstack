import { createFileRoute, redirect } from "@tanstack/react-router";
import BotForm from "#/components/form/BotForm";
import { checkAuthServerFn } from "#/lib/auth.functions";

const siteUrl =
	(typeof process !== "undefined" ? process.env.BETTER_AUTH_URL : undefined) ||
	"https://dchubs.org";

export const Route = createFileRoute("/protected/add-bot")({
	preload: false,
	beforeLoad: async ({ location }) => {
		// 這裡會透過 RPC 呼叫後端確認 Header 狀態
		const authStatus = await checkAuthServerFn();

		if (!authStatus.isAuthenticated || !authStatus.userId) {
			throw redirect({
				to: "/",
				search: { redirect: location.href },
			});
		}
	},
	head: ({ match }) => {
		const publishTitle = "發布機器人 | DiscordHubs";
		const publishCanonical = new URL(match.pathname, siteUrl).toString();

		return {
			meta: [{ title: publishTitle }],
			links: [{ rel: "canonical", href: publishCanonical }],
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <BotForm mode="create" />;
}
