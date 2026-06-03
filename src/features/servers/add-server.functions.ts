import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import { protectedMiddleware } from "#/lib/auth-middleware";
import { getGuildMembershipBundle } from "./add-server.server";

const emptySchema = Schema.Struct({});
const strictValidator = (input: any) => {
	Schema.decodeUnknownSync(emptySchema)(input || {});
	return {};
};

export const getGuildMembershipBundleFn = createServerFn({
	method: "GET",
})
	.middleware([protectedMiddleware]) // ⬅️ 套用保護，強制要求登入
	.inputValidator(strictValidator)
	.handler(async () => {
		return getGuildMembershipBundle();
	});
