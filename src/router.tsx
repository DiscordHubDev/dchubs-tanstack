import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getGlobalStartContext } from "@tanstack/react-start";
import { ErrorState } from "./components/ErrorState";
import LoadingPage from "./components/loading";
import { getQueryClient } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	// 1. 先實例化一個獨立的 QueryClient
	const queryClient = getQueryClient();
	const nonce = getGlobalStartContext()?.nonce;

	const router = createTanStackRouter({
		routeTree,
		// 2. 在這裡正式宣告初始的 Context
		context: {
			queryClient,
			session: null, // 給予 session 一個預設值，這會滿足你 Root Route 的型別要求
			status: "unauthenticated",
		},
		ssr: { nonce },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadDelay: 50,
		defaultPreloadStaleTime: 30000,
		defaultPendingComponent: () => (
			<LoadingPage loadingText="加載中..." subText="請稍候" loaderType="dots" />
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
