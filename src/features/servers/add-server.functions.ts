import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import { getGuildMembershipBundle } from "./add-server.server";

const emptySchema = Schema.Struct({});
const strictValidator = (input: any) => {
	Schema.decodeUnknownSync(emptySchema)(input || {});
	return {};
};

export const getGuildMembershipBundleFn = createServerFn({
	method: "GET",
})
	.inputValidator(strictValidator)
	.handler(async () => {
		return getGuildMembershipBundle();
	});
