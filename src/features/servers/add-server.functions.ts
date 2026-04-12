import { createServerFn } from "@tanstack/react-start";
import { getGuildMembershipBundle } from "./add-server.server";

export const getGuildMembershipBundleFn = createServerFn({
	method: "GET",
}).handler(async () => {
	return getGuildMembershipBundle();
});
