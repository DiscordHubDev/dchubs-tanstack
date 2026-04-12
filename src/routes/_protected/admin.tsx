import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/_protected/admin")({
	beforeLoad: async () => {
		const session = await getSession();

		if (!session) {
			throw redirect({ to: "/" });
		}

		return { user: session.discordProfile };
	},
	component: Dashboard,
});

function Dashboard() {
	const { user } = Route.useRouteContext();

	return <div>Welcome, {user.global_name}!</div>;
}
