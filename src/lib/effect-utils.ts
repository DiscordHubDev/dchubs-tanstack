import { Cause, Effect, type Either, ParseResult, Schema } from "effect";

export function toErrorMessage(error: unknown): string {
	if (ParseResult.isParseError(error)) {
		return ParseResult.TreeFormatter.formatErrorSync(error);
	}

	// 攔截並解開 Effect 拋出的 FiberFailure
	if (
		error !== null &&
		typeof error === "object" &&
		"_id" in error &&
		error._id === "FiberFailure"
	) {
		// squash 會攤平 Cause，回傳最根本的錯誤物件
		const squashed = Cause.squash((error as any).cause);
		return squashed instanceof Error ? squashed.message : String(squashed);
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

export function runEffectSafe<A, E>(
	effect: Effect.Effect<A, E>,
): Promise<Either.Either<A, E>> {
	return Effect.runPromise(Effect.either(effect));
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
	// 1. 提取 URL 字串 (處理 string, URL 或 Request 物件)
	const urlString =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;

	// 2. 驗證 URL 協定是否為安全的 HTTPS
	try {
		const parsedUrl = new URL(urlString);
		if (parsedUrl.protocol !== "https:") {
			return Effect.fail(
				new Error("Insecure fetch usage: Only HTTPS requests are allowed"),
			);
		}
	} catch (error) {
		// 攔截無效的 URL 格式 (例如缺少協定的相對路徑等)
		return Effect.fail(toError(error, "Invalid URL format"));
	}

	// 3. 執行原本的 fetch 流程
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
