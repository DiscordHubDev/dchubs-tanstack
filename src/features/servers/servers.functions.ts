import { createServerFn } from "@tanstack/react-start";
import { effectInputValidator } from "#/lib/effect-utils";

import { ServerListInputSchema } from "./servers.schemas";
import { listServerFilterBundle, listServersPage } from "./servers.server";

export const serversListInputSchema = ServerListInputSchema;

export const getServersListFn = createServerFn({ method: "GET" })
	.inputValidator(effectInputValidator(ServerListInputSchema))
	.handler(async ({ data }) => {
		return listServersPage(data);
	});

export const getServerFilterBundleFn = createServerFn({
	method: "GET",
}).handler(async () => {
	return listServerFilterBundle();
});
