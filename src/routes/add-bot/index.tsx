import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/add-bot/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/add-bot/"!</div>;
}
