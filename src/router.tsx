import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ErrorState } from "./components/ErrorState";
import { getQueryClient } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	// 1. 先實例化一個獨立的 QueryClient
	const queryClient = getQueryClient();

	const router = createTanStackRouter({
		routeTree,
		// 2. 在這裡正式宣告初始的 Context
		context: {
			queryClient,
			session: null, // 給予 session 一個預設值，這會滿足你 Root Route 的型別要求
		},
		scrollRestoration: true,
		defaultPreloadStaleTime: 30000,
		defaultPendingComponent: () => (
			<div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-[#1e1f22] text-white">
				<div className="h-12 w-12 animate-spin rounded-full border-[#5865f2] border-t-2 border-b-2"></div>
				<p className="animate-breath text-gray-400 text-sm">加載中...</p>
			</div>
		),
		defaultErrorComponent: ({ error }) => <ErrorState error={error} />,
	});

	// 3. SSR 整合使用剛才建立的 queryClient
	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
