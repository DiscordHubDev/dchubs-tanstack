import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ErrorState } from "./components/ErrorState";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30000,
		defaultPendingComponent: () => (
			<div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-[#1e1f22] text-white">
				<div className="h-12 w-12 animate-spin rounded-full border-[#5865f2] border-t-2 border-b-2"></div>
				<p className="animate-breath text-gray-400 text-sm">加載中...</p>
			</div>
		),
		defaultErrorComponent: ({ error }) => <ErrorState error={error} />,
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
