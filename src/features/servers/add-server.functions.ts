import { createSafeServerFn } from "#/utils/serverFn";
import { getGuildMembershipBundle } from "./add-server.server";

export const getGuildMembershipBundleFn = createSafeServerFn({
	method: "GET",
}).handler(async () => {
	return getGuildMembershipBundle();
});
