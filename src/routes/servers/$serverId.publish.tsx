import { createFileRoute } from "@tanstack/react-router";
import { ServerPublishPage } from "#/features/servers/components/ServerPublishPage";
import { serverPublishQueryOptions } from "#/features/servers/server-publish.query";

export const Route = createFileRoute("/servers/$serverId/publish")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(
			serverPublishQueryOptions(params.serverId),
		);

		return null;
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { serverId } = Route.useParams();

	return <ServerPublishPage serverId={serverId} />;
}
