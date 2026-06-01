import { createFileRoute, redirect } from "@tanstack/react-router";
import BotForm from "#/components/form/BotForm";
import { checkAuthServerFn } from "#/lib/auth.functions";

export const Route = createFileRoute("/protected/add-bot")({
	preload: false,
	beforeLoad: async ({ location }) => {
		// 這裡會透過 RPC 呼叫後端確認 Header 狀態
		const authStatus = await checkAuthServerFn();

		if (!authStatus.isAuthenticated || !authStatus.userId) {
			// 雙重保險：Client 端跳轉時發現沒登入，強制導向登入頁
			throw redirect({
				to: "/", // 或 "/login"
				search: { redirect: location.href },
			});
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <BotForm mode="create" />;
}
