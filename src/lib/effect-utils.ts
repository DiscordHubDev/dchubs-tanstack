import { Effect, ParseResult, Schema } from "effect";

export function toErrorMessage(error: unknown): string {
	if (ParseResult.isParseError(error)) {
		return ParseResult.TreeFormatter.formatErrorSync(error);
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function toError(error: unknown, fallback: string): Error {
	return new Error(`${fallback}: ${toErrorMessage(error)}`);
}

export function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
	return Effect.runPromise(effect);
}

export function tryEffectPromise<A>(
	fallback: string,
	run: () => Promise<A>,
): Effect.Effect<A, Error> {
	return Effect.tryPromise({
		try: run,
		catch: (error) => toError(error, fallback),
	});
}

export function effectInputValidator<A, I>(schema: Schema.Schema<A, I, never>) {
	const decode = Schema.decodeUnknownSync(schema);

	return (value: unknown): A => {
		try {
			return decode(value);
		} catch (error) {
			throw toError(error, "Invalid input");
		}
	};
}

export function fetchJsonEffect(
	input: RequestInfo | URL,
	init?: RequestInit,
): Effect.Effect<unknown, Error> {
	return tryEffectPromise("Request failed", () => fetch(input, init)).pipe(
		Effect.flatMap((response) => {
			if (!response.ok) {
				return Effect.fail(
					new Error(`Request failed with status ${response.status}`),
				);
			}

			return tryEffectPromise("Failed to parse JSON body", () =>
				response.json(),
			);
		}),
	);
}
