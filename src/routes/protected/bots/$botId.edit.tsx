import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import BotForm from "#/components/form/BotForm";
import { botEditQueryOptions } from "#/features/bots/bot-edit.query";
import { checkBotDeveloperServerFn } from "#/features/bots/bots.functions";
import { signIn } from "#/lib/auth-client";

export const Route = createFileRoute("/protected/bots/$botId/edit")({
  preload: false,
  beforeLoad: async ({ params }) => {
    const { isDeveloper, isLoggedIn } = await checkBotDeveloperServerFn({
      data: {
        botId: params.botId,
      },
    });

    if (!isLoggedIn) {
      await signIn(`/protected/bots/${params.botId}/edit`);
      throw redirect({ to: "/" });
    }

    // 3. 檢查是不是該機器人的開發者
    if (!isDeveloper) {
      throw redirect({
        to: "/bots/$botId",
        params: { botId: params.botId },
      });
    }

    return null;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { botId } = Route.useParams();
  const { data } = useSuspenseQuery(botEditQueryOptions(botId));

  if (data.status !== "ok") {
    return null;
  }

  return <BotForm mode="edit" defaultValues={data.bundle.defaults} />;
}
