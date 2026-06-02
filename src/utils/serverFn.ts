import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

const emptySchema = Schema.Struct({});

export function createSafeServerFn<TMethod extends "GET" | "POST">(options: {
	method: TMethod;
}) {
	const strictValidator = (input: any): any => {
		Schema.decodeUnknownSync(emptySchema)(input || {});
		return {};
	};

	return createServerFn({
		method: options.method,
	}).inputValidator(strictValidator as any);
}
