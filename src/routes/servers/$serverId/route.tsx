// servers/$serverId/$serverId.tsx

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { serverDetailQueryOptions } from "#/features/servers/server-detail.query";

export const Route = createFileRoute("/servers/$serverId")({
  // 這裡可以保留，因為 index 和 publish 都能透過 context 或 useRouteContext 拿到
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(
      serverDetailQueryOptions(params.serverId),
    );
    return { detail };
  },
  // 💡 關鍵：Component 裡面只能放 Outlet，不能放詳細頁的畫面！
  component: () => <Outlet />,
});
